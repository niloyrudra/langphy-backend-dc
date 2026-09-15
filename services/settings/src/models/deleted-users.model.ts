import { type Pool } from "pg";
import { pgPool } from "../db/index.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

export class DeletedUsersModel {
    static async insertDeletedUser(user_id: string, client: Queryable = pgPool) {
        await client.query(
            `
            INSERT INTO deleted_users (user_id, deleted_at)
            VALUES ($1, NOW())
            ON CONFLICT (user_id) DO NOTHING
            `,
            [user_id]
        );
    }

    static async exists(user_id: string, client: Queryable = pgPool): Promise<boolean> {
        const result = await client.query(
            `
            SELECT 1 FROM deleted_users WHERE user_id = $1
            `,
            [user_id]
        );

        return result.rowCount! > 0;
    }
}