import { pgPool } from "../db/index.js";

interface SessionAttemptInput {
    userId: string;
    unitId: string;
    session_type: string;
    session_key: string;
    score: number;
    attempts: number;
    total_duration_ms: number;
    completed_at: string | number;
}

export class SessionAttemptRepo {
    static async insertOnce( input: SessionAttemptInput ) {
        try {
            const now = new Date().toISOString();
            const result = await pgPool.query(
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
        catch(error) {
            console.error("Attempt Repo insertOnce error:", error);
        }
    }

    static async deleteSessionAttemptsByUserId(userId: string) {
        try {
            return await pgPool.query(
                `DELETE FROM lp_session_attempts WHERE user_id = $1`,
                [userId]
            );
        }
        catch(error) {
            console.error("deleteSessionAttemptsByUserId error:", error);
            return false;
        }
    }
}