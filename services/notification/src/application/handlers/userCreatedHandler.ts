import type { UserRegisteredEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registery.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";
import { upsertUserDailyActivity } from "../../services/user-daily-activity.service.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";

export class UserRegisteredHandler implements NotificationEventHandler<UserRegisteredEvent>
{
    async handle(event: UserRegisteredEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        const notification = {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "user.registered",
            title: "Congratulations! 🎉",
            body: `You are registered to Langhy using this email: ${event.payload.email}%`,
            read: false,
            created_at: new Date().toISOString(),
            data: { email: event.payload.email, provider: event.payload.provider },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);

        // Upsert user daily activity
        await upsertUserDailyActivity( event.user_id );
    }
}