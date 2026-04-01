import { pgPool } from "../db/index.js";

export class DeviceTokenModel {

  static async findByUserId(userId: string) {
    const result = await pgPool.query(
      `SELECT token FROM lp_device_tokens WHERE user_id = $1`,
      [userId]
    );

    return result.rows.map(r => r.token);
  }

  static async upsertToken(userId: string, token: string, platform: string) {
    await pgPool.query(
      `
      INSERT INTO lp_device_tokens (user_id, token, platform)
      VALUES ($1, $2, $3)
      ON CONFLICT (token)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        updated_at = NOW()
      `,
      [userId, token, platform]
    );
  }

  static async deleteToken( token: string) {
    await pgPool.query(
      `DELETE FROM lp_device_tokens WHERE token = $1`,
      [token]
    );
  }

  static async deletePushTokenByUserId( user_id: string) {
    await pgPool.query(
      `DELETE FROM lp_device_tokens WHERE user_id = $1`,
      [user_id]
    );
  }
}