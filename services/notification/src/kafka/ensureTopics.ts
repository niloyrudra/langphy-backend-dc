import { kafka } from "./kafka.client.js";
import { TOPICS } from "@langphy/shared";

export const ensureTopics = async () => {
    const admin = kafka.admin();
    await admin.connect();

    const existing = await admin.listTopics();

    const required = [
        TOPICS.USER_REGISTERED,
        TOPICS.USER_DELETED,
        TOPICS.SESSION_COMPLETED,
        TOPICS.LESSON_COMPLETED,
        TOPICS.STREAK_UPDATED,
        TOPICS.REMINDER_TRIGGERED,
        TOPICS.NOTIFICATION_CREATED,
    ];

    const missing = required.filter(t => !existing.includes(t));

    if (missing.length > 0) {
        await admin.createTopics({
            topics: missing.map(topic => ({
                topic,
                numPartitions: 1,
                replicationFactor: 1,
            })),
        });
        console.log(`[Kafka] Created topics: ${missing.join(", ")}`);
    } else {
        console.log("[Kafka] All topics already exist.");
    }

    await admin.disconnect();
};