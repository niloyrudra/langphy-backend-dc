import type { LessonCompletedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";
import { upsertUserDailyActivity } from "../../services/user-daily-activity.service.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";

export class LessonCompletedHandler implements NotificationEventHandler<LessonCompletedEvent>
{
    supports(eventType: string) {
        return eventType === "lesson.completed.v1";
    }

    async handle(event: LessonCompletedEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        const notification = {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "lesson.completed.v1",
            title: "Lesson Completed 🎉",
            body: `You scored ${event.payload.score}%`,
            read: false,
            created_at: new Date().toISOString(),
            data: { lessonId: event.payload.lesson_id },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);

        // Upsert user daily activity
        await upsertUserDailyActivity( event.user_id );
    }
}