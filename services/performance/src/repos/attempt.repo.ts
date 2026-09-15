import { type Pool } from "pg";
import { pgPool } from "../db/index.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

interface SessionAttemptInput {
    userId: string;
    unitId: string;
    session_type: string;
    session_key: string;
    score: number;
    attempts: number;
    total_duration_ms: number;
    completed_at: string | number;
    // completed_at: string | number | Date;
}

export class SessionAttemptRepo {
    private static async runInsertOnce(client: Queryable, input: SessionAttemptInput) {
        const now = new Date().toISOString();
        const result = await client.query(
            `
            INSERT INTO lp_session_attempts (
                user_id,
                unit_id,
                session_type,
                session_key,
                score,
                attempts,
                total_duration_ms,
                occurred_at,
                created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9)
            RETURNING id
            `,
            [
                input.userId,
                input.unitId,
                input.session_type,
                input.session_key,
                input.score,
                input.attempts,
                input.total_duration_ms,
                input.completed_at,
                now
            ]
        );
        return result.rows[0] ?? null;
    }

    /**
     * Legacy non-transactional path. Swallows DB errors and returns null.
     */
    static async insertOnce( input: SessionAttemptInput ) {
        try {
            return await SessionAttemptRepo.runInsertOnce(pgPool, input);
        }
        catch(error) {
            console.error("Attempt Repo insertOnce error:", error);
            return null;
        }
    }

    /**
     * Transactional path for the Kafka consumer. Runs on the caller's client
     * and lets errors propagate so the surrounding transaction can ROLLBACK —
     * EXCEPT a unique violation on (user_id, session_key), which is how a
     * re-delivered attempt is detected. That returns null (idempotent no-op).
     */
    static async insertOnceTx( client: Queryable, input: SessionAttemptInput ) {
        try {
            return await SessionAttemptRepo.runInsertOnce(client, input);
        }
        catch(error: any) {
            if (error?.code === "23505") return null; // duplicate attempt — idempotent
            throw error;
        }
    }

    static async deleteSessionAttemptsByUserId(userId: string, client: Queryable = pgPool) {
        return await client.query(
            `DELETE FROM lp_session_attempts WHERE user_id = $1`,
            [userId]
        );
    }
}