import { schedule } from "node-cron";
import { pgPool } from "../db/index.js";
import { emitReminderTriggered } from "../kafka/producer.js";

export const startDailyReminderJob = () => {
    schedule("0 19 * * *", async () => {
        console.log("Running daily reminder job...");

        try {
            const { rows } = await pgPool.query(`
                SELECT user_id
                FROM user_daily_activity
                WHERE last_activity_date < CURRENT_DATE
                OR last_activity_date IS NULL
            `);

            for (const user of rows) {
                await emitReminderTriggered( user.user_id );
            }

            console.log(`Reminders sent to ${rows.length} users`);
        } catch (err) {
            console.error("Daily reminder job error:", err);
        }
    });
};