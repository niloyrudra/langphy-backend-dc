import { pgPool } from "../db/index.js";

export class UserDailyActivityModel {

  static async findByUserId(userId: string) {
    const result = await pgPool.query(
      `SELECT * FROM lp_user_daily_activity WHERE user_id = $1`,
      [userId]
    );

    return result.rows.map(r => r.token);
  }

  static async upsertUserDailyActivity(userId: string) {
    await pgPool.query(
      `
      INSERT INTO lp_user_daily_activity (user_id, last_activity_date)
      VALUES ($1, CURRENT_DATE)
      ON CONFLICT (user_id)
      DO UPDATE SET last_activity_date = CURRENT_DATE,
      `,
      [userId]
    );
  }

  static async deleteUserDailyActivity(userId: string) {
    await pgPool.query(
      `
      DELETE FROM lp_user_daily_activity WHERE user_id = $1
      `,
      [userId]
    );
  }

}