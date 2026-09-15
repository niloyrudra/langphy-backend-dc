import { type Pool } from "pg";
import { pgPool } from "../db/index.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

export interface ProgressData {
    category_id: string;
    unit_id: string;
    user_id: string;
    content_type: string;
    content_id: string;
    session_key: string;
    lesson_order: number;
    completed: boolean;
    score: number;
    duration_ms: number;
    progress_percent: number;
}

export class ProgressModel {

    private static async runUpsert(client: Queryable, data: ProgressData) {
        const result = await client.query(
            `
            INSERT INTO lp_progress (
                category_id,
                unit_id,
                user_id,
                content_type,
                content_id,
                session_key,
                lesson_order,
                completed,
                score,
                duration_ms,
                progress_percent
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (user_id, content_type, content_id)
            DO UPDATE SET
                category_id = EXCLUDED.category_id,
                unit_id = EXCLUDED.unit_id,
                session_key = EXCLUDED.session_key,
                lesson_order = EXCLUDED.lesson_order,
                completed = EXCLUDED.completed OR lp_progress.completed,
                score = GREATEST(lp_progress.score, EXCLUDED.score),
                duration_ms = lp_progress.duration_ms + EXCLUDED.duration_ms,
                progress_percent = GREATEST(
                    lp_progress.progress_percent,
                    EXCLUDED.progress_percent
                ),
                updated_at = now()
            RETURNING *;
            `,
            [
                data.category_id,
                data.unit_id,
                data.user_id,
                data.content_type,
                data.content_id,
                data.session_key,
                data.lesson_order,
                data.completed,
                data.score,
                data.duration_ms,
                data.progress_percent,
            ]
        );

        return result.rows[0] ?? null;
    }

    static async upsertProgress(data: ProgressData) {
        try {
            return await ProgressModel.runUpsert(pgPool, data);
        }
        catch(error) {
            console.log("upsertProgress error:", error);
            return null;
        }
    }

    /**
     * Transactional variant for Kafka consumers. Runs on the caller's client
     * (inside an open transaction) and lets errors propagate so the caller can
     * ROLLBACK.
     */
    static async upsertProgressTx(client: Queryable, data: ProgressData) {
        return await ProgressModel.runUpsert(client, data);
    }

    private static async runGetByUserAndContent(
        client: Queryable,
        userId: string,
        contentType: string,
        contentId: string
    ) {
        const result = await client.query(
            `
            SELECT * FROM lp_progress
            WHERE user_id = $1
                AND content_type = $2
                AND content_id = $3
            `,
            [
                userId,
                contentType,
                contentId
            ]
        );
        return result.rows[0] ?? null;
    }

    static async getByUserAndContent( userId: string, contentType: string, contentId: string ) {
        try {
            return await ProgressModel.runGetByUserAndContent(
                pgPool,
                userId,
                contentType,
                contentId
            );
        }
        catch(error) {
            console.error("ProgressModel getByUserAndContent error:", error);
            return null;
        }
    }

    /**
     * Transactional variant for Kafka consumers. Runs on the caller's client
     * (inside an open transaction) and lets errors propagate so the caller can
     * ROLLBACK.
     */
    static async getByUserAndContentTx(
        client: Queryable,
        userId: string,
        contentType: string,
        contentId: string
    ) {
        return await ProgressModel.runGetByUserAndContent(
            client,
            userId,
            contentType,
            contentId
        );
    }

    static async getUserProgress(userId: string) {
        const result = await pgPool.query(
            `SELECT * FROM lp_progress WHERE user_id = $1`,
            [userId]
        );
        return result.rows;
    }

    static async deleteProgressByUserId( userId: string, client: Queryable = pgPool ) {
        return await client.query(
            `DELETE FROM lp_progress WHERE user_id = $1`,
            [userId]
        );
    }
}