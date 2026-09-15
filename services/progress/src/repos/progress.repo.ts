import { type Pool } from "pg";
import { pgPool } from "../db/index.js";
import { ProgressModel } from "../models/progress.model.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

export interface ProgressInput {
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


export class ProgressRepo {
    /**
     * Applies a progress activity. Pass a transactional `client` when called
     * from a Kafka consumer so the read-modify-write + event_inbox insert
     * happen atomically. Errors PROPAGATE (no silent swallow) so the caller
     * can ROLLBACK.
     */
    static async applyActivity( input: ProgressInput, client?: Queryable ) {
        const db = client ?? pgPool;

        const existing = await ProgressModel.getByUserAndContentTx(
            db,
            input.user_id,
            input.content_type,
            input.content_id
        );

        const progress = await ProgressModel.upsertProgressTx(db, input);

        const updated = !existing ||
                        existing.progress_percent !== progress.progress_percent ||
                        existing.completed !== progress.completed ||
                        existing.score !== progress.score;

        return {
            updated,
            progress
        };
    }

    static async deleteProgress( user_id: string, client?: Queryable ) {
        const db = client ?? pgPool;
        return await ProgressModel.deleteProgressByUserId( user_id, db );
    }
}