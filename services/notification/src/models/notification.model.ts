import { pgPool } from "../db/index.js";
import type { Notification } from "../controllers/notifications.controller.js";

export class NotificationModel {

    static async upsertNotification(data: Notification) {
        try {
            const result = await pgPool.query(
                `
                INSERT INTO lp_notifications (
                    user_id,
                    type,
                    title,
                    body,
                    read,
                    data,
                    created_at
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    type = EXCLUDED.type,
                    title = EXCLUDED.title,
                    body = EXCLUDED.body,
                    read = EXCLUDED.read OR lp_notifications.read,
                    data = EXCLUDED.data,
                    created_at = now()
                RETURNING *
                `,
                [
                    data.user_id,
                    data.type,
                    data.title,
                    data.body,
                    data.read,
                    JSON.stringify(data.data),
                    data.created_at,
                ]
            );
    
            return result.rows[0] ?? null;
        }
        catch(error) {
            console.log("upsertNotification error:", error);
            return null;
        }
    }

    static async getByUserIdAndType( userId: string, type: string ) {
        try {
            const result = await pgPool.query(
                `
                SELECT * FROM lp_notifications
                WHERE user_id = $1
                    AND type = $2
                ORDER BY created_at DESC
                `,
                [
                    userId,
                    type,
                ]
            );
            return result.rows[0] ?? null;
        }
        catch(error) {
            console.error("NotificationModel getByUserIdAndType error:", error);
            return null;
        }
    }

    static async getUserNotifications(userId: string) {
        const result = await pgPool.query(
            `SELECT * FROM lp_notifications WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    static async deleteUserNotifications(userId: string) {
        return await pgPool.query(
            `DELETE FROM lp_notifications WHERE user_id = $1`,
            [userId]
        );
    }
}