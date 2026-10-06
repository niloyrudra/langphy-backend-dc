import type { VocabSessionCompletedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";
import { randomUUID } from "crypto";

export class VocabSessionCompletedHandler implements NotificationEventHandler<VocabSessionCompletedEvent>
{
    async handle(event: VocabSessionCompletedEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        
        const accuracy = event.payload.words_total > 0 
            ? Math.round((event.payload.words_correct / event.payload.words_total) * 100) 
            : 0;
        
        const notification = {
            id: randomUUID(),
            user_id: event.user_id,
            type: "vocabulary.session.completed.v1",
            title: "Vocabulary session completed! 🎯",
            body: `You completed a ${event.payload.mode} session: ${event.payload.words_correct}/${event.payload.words_total} words (${accuracy}%)`,
            read: false,
            created_at: new Date().toISOString(),
            data: { 
                session_id: event.payload.session_id,
                mode: event.payload.mode,
                words_correct: event.payload.words_correct,
                words_total: event.payload.words_total,
                xp_earned: event.payload.xp_earned,
            },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);

        console.log(`VocabSessionCompletedHandler: Sent session completed notification to user ${event.user_id} with ${event.payload.xp_earned} XP`);
    }
}