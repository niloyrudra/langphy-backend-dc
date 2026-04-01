import type { LessonCompletedEvent, StreakUpdatedEvent } from "@langphy/shared";
import type { Notification } from "../controllers/notifications.controller.js";

export class NotificationFactory {
    static fromLessonCompleted( event: LessonCompletedEvent ): Notification {
        return {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "lesson.completed.v1",
            title: "Lesson Completed 🎉",
            body: `You scored ${event.payload.score}%.`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
                lesson_id: event.payload.lesson_id
            }
        };
    }

    static fromStreakUpdated( event: StreakUpdatedEvent ): Notification {
        return {
            id: crypto.randomUUID(),
            user_id: event.user_id,
            type: "streak.updated.v1",
            title: "Streak Updated 🎉",
            body: `Your current streak is ${event.payload.current_streak}.`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
                current_streak: event.payload.current_streak
            }
        }
    }
};