import { pgPool } from "../db/index.js";

export class DeletedUsersModel {
    static async insertDeletedUser(user_id: string) {
        await pgPool.query(
            `
            INSERT INTO deleted_users (user_id, deleted_at)
            VALUES ($1, NOW())
            ON CONFLICT (user_id) DO NOTHING
            `,
            [user_id]
        );
    }

    static async exists(user_id: string): Promise<boolean> {
        const result = await pgPool.query(
            `
            SELECT 1 FROM deleted_users WHERE user_id = $1
            `,
            [user_id]
        );

        return result.rowCount! > 0;
    }
}