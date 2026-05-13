import type { StreakUpdatedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";
import { randomUUID } from "crypto";

export class StreakUpdatedHandler implements NotificationEventHandler<StreakUpdatedEvent>
{
    async handle(event: StreakUpdatedEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        const notification = {
            id: randomUUID(),
            user_id: event.user_id,
            type: "streak.updated.v1",
            title: "Streak updated 🔥",
            body: `Your current streak is ${event.payload.current_streak} day${event.payload.current_streak !== 1 ? "s" : ""} — keep it up!`,
            read: false,
            created_at: new Date().toISOString(),
            data: { last_active_date: event.payload.last_activity_date },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);

        console.log(`StreakUpdatedHandler: Sent streak updated notification to user ${event.user_id} with current streak ${event.payload.current_streak} and last active date ${event.payload.last_activity_date}`);
    }
}