import type { ReminderTriggeredEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
// import { sendPushNotification } from "../../services/push.service.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";

export class ReminderTriggeredHandler implements NotificationEventHandler<ReminderTriggeredEvent>
{
    async handle(event: ReminderTriggeredEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        const notification = {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "reminder.triggered.v1",
            title: "⏰ Time to Practice!",
            body: `Don’t break your streak — complete a lesson now!`,
            read: false,
            created_at: new Date().toISOString(),
            data: {},
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);
    }
}