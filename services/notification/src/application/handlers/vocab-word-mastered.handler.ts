import type { VocabWordMasteredEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";
import { randomUUID } from "crypto";

export class VocabWordMasteredHandler implements NotificationEventHandler<VocabWordMasteredEvent>
{
    async handle(event: VocabWordMasteredEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        
        const notification = {
            id: randomUUID(),
            user_id: event.user_id,
            type: "vocabulary.word.mastered.v1",
            title: "Word mastered! ⭐",
            body: `You've mastered "${event.payload.lemma}" (${event.payload.repetitions} reviews)`,
            read: false,
            created_at: new Date().toISOString(),
            data: { 
                lemma: event.payload.lemma,
                pos: event.payload.pos,
                meaning_en: event.payload.meaning_en,
                repetitions: event.payload.repetitions,
                ease_factor: event.payload.ease_factor,
            },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);

        console.log(`VocabWordMasteredHandler: Sent word mastered notification to user ${event.user_id} for ${event.payload.lemma}`);
    }
}