// import { AchievementUnlockedEventSchema, LessonCompletedEventSchema, ReminderTriggeredEventSchema, SessionCompletedEventSchema, StreakUpdatedEventSchema, TOPICS, UserDeletedEventSchema, UserRegisteredEventSchema } from "@langphy/shared";
import { connectWithRetry, LessonCompletedEventSchema, ReminderTriggeredEventSchema, SessionCompletedEventSchema, StreakUpdatedEventSchema, TOPICS, UserDeletedEventSchema, UserRegisteredEventSchema } from "@langphy/shared";
import { kafka } from "./kafka.client.js"
import { EventIndexModel } from "../models/eventIndex.model.js";
import { topicHandlerMap } from "../application/handle.registery.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const serviceName = process.env.SERVICE_NAME! ? process.env.SERVICE_NAME : 'notification-service';
const consumerGroupId = serviceName + '-group';
export const consumer = kafka.consumer({
    groupId: consumerGroupId
});

export const initConsumer = async () => {
    // await consumer.connect();
    await connectWithRetry(consumer, serviceName);

    await consumer.subscribe({
        topic: TOPICS.USER_REGISTERED,
    });

    await consumer.subscribe({
        topic: TOPICS.USER_DELETED,
        fromBeginning: false
    });

    // await consumer.subscribe({
    //     topic: TOPICS.ACHIEVEMENT_UNLOCKED,
    //     fromBeginning: false
    // });

    await consumer.subscribe({
        topic: TOPICS.SESSION_COMPLETED,
        fromBeginning: false
    });

    await consumer.subscribe({
        topic: TOPICS.LESSON_COMPLETED,
        fromBeginning: false
    });

    await consumer.subscribe({
        topic: TOPICS.STREAK_UPDATED,
        fromBeginning: false
    });

    await consumer.subscribe({
        topic: TOPICS.REMINDER_TRIGGERED,
        fromBeginning: false
    });

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            if (!message.value) return;

            const raw = JSON.parse(message.value.toString());

            try {
                // 1️⃣ Idempotency first
                if (await EventIndexModel.exists(raw.event_id)) return;
                if (await DeletedUsersRepo.exists(raw.user_id)) return;

                let event: any;

                if (topic === TOPICS.USER_DELETED) {
                    event = UserDeletedEventSchema.parse(raw);
                } 
                else if (topic === TOPICS.USER_REGISTERED) {
                    event = UserRegisteredEventSchema.parse(raw);
                }
                else if (topic === TOPICS.SESSION_COMPLETED) {
                    event = SessionCompletedEventSchema.parse(raw);
                }
                else if (topic === TOPICS.STREAK_UPDATED) {
                    event = StreakUpdatedEventSchema.parse(raw);
                }
                else if (topic === TOPICS.LESSON_COMPLETED) {
                    event = LessonCompletedEventSchema.parse(raw);
                }
                else if (topic === TOPICS.REMINDER_TRIGGERED) {
                    event = ReminderTriggeredEventSchema.parse(raw);
                }
                // else if (topic === TOPICS.ACHIEVEMENT_UNLOCKED) {
                //     event = AchievementUnlockedEventSchema.parse(raw);
                // }
                else {
                    return;
                }
                
                const handler = topicHandlerMap[topic];

                if (!handler) return;

                await handler.handle(event);

                await EventIndexModel.markProcessed(event);

            } catch (error) {
                console.warn("Notification consumer error:", error);
                throw error;
            }
        }
    });
}