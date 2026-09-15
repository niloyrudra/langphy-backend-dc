import { type Pool } from "pg";
import { pgPool } from "../db/index.js";
import { SessionAttemptRepo } from "../repos/attempt.repo.js";
import { SessionPerformanceRepo } from "../repos/sessionPerformance.repo.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

interface SessionCompletedEvent {
    user_id: string;
    unit_id: string;
    session_type: string;
    session_key: string;
    score: number;
    attempts: number;
    total_duration_ms: number;
    completed_at: string | number;
};

export interface SessionCompletedResult {
    updated: boolean;
    reason?: "duplicate-attempt";
}

/**
 * Applies a session.completed.v1 event to the performance tables.
 *
 * Duplicate attempts (a re-delivered event, detected via the
 * (user_id, session_key) unique constraint) are an idempotent no-op and
 * return `{ updated: false }`.
 *
 * @param client optional transactional client. Pass it from the Kafka
 * consumer so the attempt insert + performance upsert run inside the SAME
 * transaction as the event_inbox insert. Errors PROPAGATE (except the
 * duplicate-attempt case) so the caller can ROLLBACK.
 */
export const handleSessionCompleted = async ( event: SessionCompletedEvent, client?: Queryable ): Promise<SessionCompletedResult> => {
    const db = client ?? pgPool;
    const completedAt = normalizeTimestamp(event.completed_at).toISOString();

    const attemptId = await SessionAttemptRepo.insertOnceTx(db, {
        userId: event.user_id,
        unitId: event.unit_id,
        session_type: event.session_type,
        session_key: event.session_key,
        score: event.score,
        attempts: event.attempts,
        total_duration_ms: event.total_duration_ms,
        completed_at: completedAt
    });

    // Retry / duplicate attempt -> idempotent no-op.
    if (!attemptId) return { updated: false, reason: "duplicate-attempt" as const };

    // New completion or redo -> replace performance row.
    await SessionPerformanceRepo.upsertTx(db, {
        userId: event.user_id,
        unitId: event.unit_id,
        session_type: event.session_type,
        session_key: event.session_key,
        score: event.score,
        attempts: event.attempts,
        total_duration_ms: event.total_duration_ms,
        completed_at: completedAt
    });

    return { updated: true };
}

export const normalizeTimestamp = (
    value?: string | number | Date | null
): Date => {
    if (!value) {
        return new Date();
    }

    // Already a Date
    if (value instanceof Date) {
        return value;
    }

    // Numeric timestamp
    if (typeof value === 'number') {
        // seconds -> milliseconds
        if (value < 1000000000000) {
            return new Date(value * 1000);
        }

        return new Date(value);
    }

    // Numeric string
    if (/^\d+$/.test(value)) {
        const num = Number(value);

        // seconds
        if (num < 1000000000000) {
            return new Date(num * 1000);
        }

        // milliseconds
        return new Date(num);
    }

    // ISO string
    return new Date(value);
};