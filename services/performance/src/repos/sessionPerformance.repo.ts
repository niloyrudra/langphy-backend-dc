import { type Pool } from "pg";
import { pgPool } from "../db/index.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

interface SessionPerformanceInput {
    userId: string;
    unitId: string;
    session_key: string;
    session_type: string;
    score: number;
    attempts?: number;
    total_duration_ms: number;
    completed_at: string | number;
}

export class SessionPerformanceRepo {
    private static async runUpsert(client: Queryable, input: SessionPerformanceInput) {
        const result = await client.query(
            `
            INSERT INTO lp_session_performance (
                user_id,
                unit_id,
                session_type,
                session_key,
                score,
                attempts,
                total_duration_ms,
                completed_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (user_id, session_key, session_type)
            DO UPDATE SET
                session_key = EXCLUDED.session_key,
                session_type = EXCLUDED.session_type,
                score = EXCLUDED.score,
                attempts = EXCLUDED.attempts,
                total_duration_ms = EXCLUDED.total_duration_ms,
                completed_at = EXCLUDED.completed_at,
                updated_at = now()
            RETURNING 1
            `,
            [
                input.userId,
                input.unitId,
                input.session_type,
                input.session_key,
                input.score,
                input.attempts,
                input.total_duration_ms,
                input.completed_at
            ]
        );
        return result.rows[0] ?? null;
    }

    /**
     * Legacy non-transactional path. Swallows DB errors and returns null.
     */
    static async upsert( input: SessionPerformanceInput ) {
        try {
            return await SessionPerformanceRepo.runUpsert(pgPool, input);
        }
        catch(error) {
            console.error("Session Performance Repo upsert error:", error);
            return null;
        }
    }

    /**
     * Transactional path for the Kafka consumer. Runs on the caller's client
     * and lets errors propagate so the surrounding transaction can ROLLBACK.
     */
    static async upsertTx( client: Queryable, input: SessionPerformanceInput ) {
        return await SessionPerformanceRepo.runUpsert(client, input);
    }

    static async getSessionPerformanceByUserAndUnitId( user_id: string, unit_id: string, session_type: string ) {
        try {
            const result = await pgPool.query(
                `
                SELECT *
                FROM lp_session_performance
                WHERE user_id = $1
                    AND unit_id = $2
                    AND session_type = $3
                `,
                [
                    user_id,
                    unit_id,
                    session_type
                ]
            );
            return result.rows[0] ?? null;
        }
        catch(error) {
            console.error("Session Performance Repo getSessionPerformanceByUserAndUnitId error:", error);
            return null;
        }
    }

    static async deleteSessionPerformanceByUserId(userId: string, client: Queryable = pgPool) {
        return await client.query(
            `DELETE FROM lp_session_performance WHERE user_id = $1`,
            [userId]
        );
    }
}