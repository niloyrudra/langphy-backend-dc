import type { VocabAchievementUnlockedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
import type { Notification } from "../../controllers/notifications.controller.js";
import { saveNotification } from "../../repos/notifications.repo.js";
import { emitNotificationCreated } from "../../kafka/producer.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { sendExpoPush } from "../../repos/push-notification.repo.js";
import { randomUUID } from "crypto";

export class VocabAchievementUnlockedHandler implements NotificationEventHandler<VocabAchievementUnlockedEvent>
{
    async handle(event: VocabAchievementUnlockedEvent) {
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }
        
        const notification = {
            id: randomUUID(),
            user_id: event.user_id,
            type: "vocabulary.achievement.unlocked.v1",
            title: `Achievement unlocked! ${event.payload.achievement_name}`,
            body: `You earned ${event.payload.xp_reward} XP!`,
            read: false,
            created_at: new Date().toISOString(),
            data: { 
                achievement_code: event.payload.achievement_code,
                achievement_name: event.payload.achievement_name,
                xp_reward: event.payload.xp_reward,
            },
        } as Notification;

        await saveNotification(notification);
        await emitNotificationCreated(notification);
        
        await sendExpoPush(notification);

        console.log(`VocabAchievementUnlockedHandler: Sent achievement unlocked notification to user ${event.user_id} for ${event.payload.achievement_name}`);
    }
}