import { pgPool } from "../db/index.js";

export class DeviceTokenModel {

    /**
     * Return all push tokens registered for a user.
     * Used by the push service when sending notifications.
     */
    static async findByUserId(userId: string): Promise<string[]> {
        const result = await pgPool.query(
            `SELECT token FROM lp_device_tokens WHERE user_id = $1`,
            [userId]
        );
        return result.rows.map(r => r.token as string);
    }

    /**
     * Insert or update a device token.
     * ON CONFLICT (token) — token is the unique key, not (user_id, token),
     * because a token is globally unique across all Expo/FCM installations.
     * If the same token re-appears for a different user (device re-use after
     * account switch), the user_id is corrected automatically.
     */
    static async upsertToken(userId: string, token: string, platform: string): Promise<void> {
        await pgPool.query(
            `
            INSERT INTO lp_device_tokens (user_id, token, platform, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (token)
            DO UPDATE SET
                user_id    = EXCLUDED.user_id,
                platform   = EXCLUDED.platform,
                updated_at = NOW()
            `,
            [userId, token, platform]
        );
    }

    /**
     * Delete a token by value — used for:
     *   - Expo/FCM DeviceNotRegistered cleanup (server-initiated)
     *   - Account deletion (all tokens for a user via deletePushTokenByUserId)
     */
    static async deleteToken(token: string): Promise<void> {
        await pgPool.query(
            `DELETE FROM lp_device_tokens WHERE token = $1`,
            [token]
        );
    }

    /**
     * Delete a specific token scoped to a user_id.
     * Used by deregisterDeviceToken (user-initiated) so a user can never
     * remove a token that doesn't belong to them.
     *
     * Returns silently if the token doesn't exist — deregister is idempotent.
     */
    static async deleteTokenForUser(userId: string, token: string): Promise<void> {
        await pgPool.query(
            `DELETE FROM lp_device_tokens WHERE user_id = $1 AND token = $2`,
            [userId, token]
        );
    }

    /**
     * Delete all tokens for a user — called on account deletion.
     */
    static async deletePushTokenByUserId(userId: string): Promise<void> {
        await pgPool.query(
            `DELETE FROM lp_device_tokens WHERE user_id = $1`,
            [userId]
        );
    }
}