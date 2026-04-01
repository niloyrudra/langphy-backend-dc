import type { StreakUpdatedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registery.js";
import { sendPushNotification } from "../../services/push.service.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";

export class StreakUpdatedHandler implements NotificationEventHandler<StreakUpdatedEvent>
{
    async handle(event: StreakUpdatedEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        const notification = {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "streak.updated",
            title: "Streak updated 🎉",
            body: `You current streak is ${event.payload.current_streak}`,
            read: false,
            created_at: new Date().toISOString(),
            data: { last_active_date: event.payload.last_activity_date },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendPushNotification(notification);
    }
}