import { TOPICS, type StreakUpdatedEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";

/**
 * Initialised by `initProducer()`. The consumer's SessionCompletedHandler
 * uses this directly so its tests can target the same object.
 */
export const producer = kafka.producer();

let started = false;

export const initProducer = async () => {
    if (started) return;
    await producer.connect();
    started = true;
    console.log(
        `[${process.env.SERVICE_NAME || "streaks-service"}] Kafka producer connected`,
    );
};

export const shutdownProducer = async () => {
    if (!started) return;
    await producer.disconnect();
    started = false;
    console.log(
        `[${process.env.SERVICE_NAME || "streaks-service"}] Kafka producer disconnected`,
    );
};

/**
 * Low-level send used by the consumer handler. Kept as a thin wrapper
 * so the handler doesn't have to know the topic string.
 */
export const publishStreakUpdated = async (event: StreakUpdatedEvent) => {
    await producer.send({
        topic: TOPICS.STREAK_UPDATED,
        messages: [{ key: event.user_id, value: JSON.stringify(event) }],
    });
};
