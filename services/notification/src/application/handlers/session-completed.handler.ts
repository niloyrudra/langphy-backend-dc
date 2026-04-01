import type { SessionCompletedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registery.js";
import { sendPushNotification } from "../../services/push.service.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";

export class SessionCompletedHandler implements NotificationEventHandler<SessionCompletedEvent>
{
    async handle(event: SessionCompletedEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        const notification = {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "session.completed",
            title: "Session completed 🎉",
            body: `You completed a session, unit id: ${event.payload.unit_id} and session type: ${event.payload.session_type}, today.`,
            read: false,
            created_at: new Date().toISOString(),
            data: { unit_id: event.payload.unit_id, session_type: event.payload.session_type },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendPushNotification(notification);
    }
}