import { schedule } from "node-cron";
import { pgPool } from "../db/index.js";
import { emitReminderTriggered } from "../kafka/producer.js";
import type { Notification } from "../controllers/notifications.controller.js";

/**
 * Runs at 19:00 every day.
 * Finds users who have not been active today and emits a reminder event for each.
 *
 * FIX: previously passed user.user_id (a string) directly to emitReminderTriggered,
 * which expects a full Notification object. The producer then read undefined for all
 * fields, emitting a structurally empty Kafka message that failed Zod validation in
 * the consumer, causing KafkaJSNumberOfRetriesExceeded and crashing the consumer loop.
 */
export const startDailyReminderJob = () => {
    schedule("0 19 * * *", async () => {
        console.log("Running daily reminder job...");

        try {
            const { rows } = await pgPool.query(`
                SELECT user_id
                FROM lp_user_daily_activity
                WHERE last_activity_date < CURRENT_DATE
                   OR last_activity_date IS NULL
            `);

            for (const user of rows) {
                const notification: Notification = {
                    id:         crypto.randomUUID(),
                    user_id:    user.user_id,
                    type:       "reminder.triggered",
                    title:      "⏰ Time to Practice!",
                    body:       "Don't break your streak — complete a lesson now!",
                    read:       false,
                    created_at: new Date().toISOString(),
                    data:       {},
                };

                await emitReminderTriggered(notification);
            }

            console.log(`Reminders sent to ${rows.length} users`);
        } catch (err) {
            console.error("Daily reminder job error:", err);
        }
    });
};