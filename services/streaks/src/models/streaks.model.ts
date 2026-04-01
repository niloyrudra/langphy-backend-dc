import { pgPool } from "../db/index.js";

export interface UserStreak {
    id: string;
    user_id: string;
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
    created_at: Date;
    updated_at: Date;
}

export class StreakModel {

    // Get streak
    static async findByUserId(userId: string): Promise<UserStreak | null> {
        const result = await pgPool.query(
            `SELECT current_streak, longest_streak, last_activity_date FROM lp_streaks WHERE user_id = $1`,
            [userId]
        );
        return result.rows[0] || null;
    }

    // Get streak
    static async getStreak(userId: string): Promise<UserStreak | null> {
        const result = await pgPool.query(
            `SELECT current_streak, longest_streak, last_activity_date FROM lp_streaks WHERE user_id = $1`,
            [userId]
        );
        return result.rows[0] || null;
    }

    // Create streak row
    static async createStreak(userId: string): Promise<UserStreak | null> {
        try {
            const res = await pgPool.query(
                `
                INSERT INTO lp_streaks (
                    user_id,
                    current_streak,
                    longest_streak,
                    last_activity_date
                )
                VALUES ($1, 0, 0, NULL)
                ON CONFLICT (user_id) DO NOTHING
                RETURNING *
                `,
                [userId]
            );

            console.log("💡 Insert result:", res.rows);

            if (res.rows.length === 0) {
                const existing = await pgPool.query(
                    `SELECT * FROM lp_streaks WHERE user_id = $1`,
                    [userId]
                );
                console.log("💡 Existing streak:", existing.rows);
                return existing.rows[0];
            }

            return res.rows[0];
        } catch (err) {
            console.error("❌ createStreak failed:", err);
            throw err;  // Re-throw so you can see it in consumer logs
        }
    }

    // Create streak row
    static async getStreakIfExists(userId: string): Promise<UserStreak | undefined> {
        try {
            const result = await pgPool.query(
                `SELECT * FROM lp_streaks WHERE user_id = $1`,
                [userId]
            );
            return result.rows[0];
            
        } catch (err: any) {
            if (err.code === "23505") {
                throw new Error("Streak already exists for this user");
            }
            throw err;
        }
    }

    // Create streak row
    static async deleteStreakByUserId(userId: string): Promise<boolean> {
        try {
            await pgPool.query(
                `DELETE FROM lp_streaks WHERE user_id = $1`,
                [userId]
            );
            return true;
            
        } catch (error: any) {
            console.error("deleteStreakByUserId error:", error);
            return false;
        }
    }

    // Update streak on daily activity
    static async updateStreak(userId: string): Promise<UserStreak> {
        const result = await pgPool.query(
            `
            UPDATE lp_streaks
            SET
                current_streak = CASE
                    WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                        THEN current_streak + 1
                    WHEN last_activity_date = CURRENT_DATE
                        THEN current_streak
                    ELSE 1
                END,
                longest_streak = GREATEST(
                    longest_streak,
                    CASE
                        WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                            THEN current_streak + 1
                        ELSE 1
                    END
                ),
                last_activity_date = CURRENT_DATE,
                updated_at = now()
            WHERE user_id = $1
            RETURNING
                user_id,
                current_streak,
                longest_streak,
                EXTRACT(EPOCH FROM last_activity_date::timestamptz)::bigint AS last_activity_date,
                updated_at;
            `,
            [userId]
        );
        // const result = await pgPool.query(
        //     `
        //     UPDATE lp_streaks
        //     SET
        //         current_streak = CASE
        //             WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day'
        //                 THEN current_streak + 1
        //             WHEN last_activity_date = CURRENT_DATE
        //                 THEN current_streak
        //             ELSE 1
        //         END,
        //         longest_streak = GREATEST(
        //             longest_streak,
        //             CASE
        //                 WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day'
        //                     THEN current_streak + 1
        //                 ELSE 1
        //             END
        //         ),
        //         last_activity_date = CURRENT_DATE,
        //         updated_at = now()
        //     WHERE user_id = $1
        //     RETURNING *;
        //     `,
        //     [userId]
        // );

        if (!result.rows[0]) {
            throw new Error("Streak not found");
        }

        return result.rows[0];
    }
}