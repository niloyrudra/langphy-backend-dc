import { schedule } from "node-cron";
import { pgPool } from "../db/index.js";
import { emitReminderTriggered } from "../kafka/producer.js";
import type { Notification } from "../controllers/notifications.controller.js";
import { randomUUID } from "crypto";

/**
 * Runs every hour to check for users who should receive reminders.
 * 
 * Logic:
 * 1. For each user, get their timezone from streaks table (preferred) or settings (fallback)
 * 2. Check if current time is in their evening hours (18:00-22:00 local time)
 * 3. Check if they've been inactive today (no activity in lp_user_daily_activity)
 * 4. Check if they've received less than 3 reminders today
 * 5. Check if their streak hasn't been updated today (to avoid spamming after streak update)
 * 6. If all conditions met, send reminder and increment count
 */
export const startDailyReminderJob = () => {
    // Run at the top of every hour
    schedule("0 * * * *", async () => {
        console.log("Running hourly reminder job...");

        try {
            // Get current UTC time
            const nowUtc = new Date();
            
            // Query users with their timezone info and activity data
            const { rows } = await pgPool.query(`
                SELECT 
                    u.id as user_id,
                    COALESCE(st.user_timezone, s.timezone, 'UTC') as timezone,
                    uda.last_activity_date,
                    COALESCE(urc.count, 0) as reminder_count,
                    urc.last_reminder_at,
                    su.updated_at as streak_updated_at
                FROM lp_users u
                LEFT JOIN lp_streaks st ON u.id = st.user_id
                LEFT JOIN lp_settings s ON u.id = s.user_id
                LEFT JOIN lp_user_daily_activity uda ON u.id = uda.user_id
                LEFT JOIN lp_user_reminder_counts urc ON 
                    u.id = urc.user_id AND 
                    urc.reminder_date = CURRENT_DATE
                WHERE 
                    -- Only process users who exist in users table (should always be true)
                    u.id IS NOT NULL
            `);

            let remindersSent = 0;

            for (const userRow of rows) {
                try {
                    // Check if it's evening in user's timezone (18:00-22:00 local time)
                    const isEvening = isInEveningHours(nowUtc, userRow.timezone);
                    
                    // Check if user is inactive today
                    const isInactive = !userRow.last_activity_date || 
                                      userRow.last_activity_date < new Date().toISOString().split('T')[0];
                    
                    // Check if under daily limit
                    const underLimit = userRow.reminder_count < 3;
                    
                    // Check if streak hasn't been updated today (or no streak record)
                    const streakNotUpdatedToday = !userRow.streak_updated_at ||
                                                  new Date(userRow.streak_updated_at).toISOString().split('T')[0] < 
                                                  new Date().toISOString().split('T')[0];

                    // Send reminder if all conditions are met
                    if (isEvening && isInactive && underLimit && streakNotUpdatedToday) {
                        const notification: Notification = {
                            id: randomUUID(),
                            user_id: userRow.user_id,
                            type: "reminder.triggered",
                            title: "��������������⏰ Time to Practice!",
                            body: "Don't break your streak — complete a lesson now!",
                            read: false,
                            created_at: new Date().toISOString(),
                            data: {},
                        };

                        await emitReminderTriggered(notification);
                        
                        // Update reminder count
                        await updateReminderCount(pgPool, userRow.user_id);
                        
                        remindersSent++;
                        console.log(`Reminder sent to user ${userRow.user_id} (timezone: ${userRow.timezone})`);
                    }
                } catch (userErr) {
                    console.error(`Error processing user ${userRow.user_id}:`, userErr);
                    // Continue processing other users
                }
            }

            console.log(`Reminder job completed. Sent ${remindersSent} reminders.`);
        } catch (err) {
            console.error("Hourly reminder job error:", err);
        }
    });
};

// Helper method to check if current UTC time is in evening hours (18:00-22:00) for given timezone
export function isInEveningHours(nowUtc: Date, timezoneString: string): boolean {
    try {
        // Create a date in the user's timezone
        const nowLocal = new Date(nowUtc.toLocaleString("en-US", {
            timeZone: timezoneString,
            hour12: false
        }));
        
        const hour = nowLocal.getHours();
        // Evening hours: 18:00 to 21:59 (6 PM to 10 PM)
        return hour >= 18 && hour < 22;
    } catch (e) {
        console.warn(`Invalid timezone ${timezoneString}, defaulting to UTC check`);
        // Fallback to UTC check
        const hour = nowUtc.getUTCHours();
        return hour >= 18 && hour < 22;
    }
}

// Helper method to update reminder count for a user
export async function updateReminderCount(pgPool: any, userId: string): Promise<void> {
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        
        // Upsert the reminder count
        await client.query(`
            INSERT INTO lp_user_reminder_counts (user_id, reminder_date, count, last_reminder_at)
            VALUES ($1, CURRENT_DATE, 1, NOW())
            ON CONFLICT (user_id, reminder_date) 
            DO UPDATE SET 
                count = lp_user_reminder_counts.count + 1,
                last_reminder_at = NOW()
        `, [userId]);
        
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}