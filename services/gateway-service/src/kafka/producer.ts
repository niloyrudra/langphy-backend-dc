import { TOPICS, type BaseEvent } from "@langphy/shared";
import type { Producer } from "kafkajs";
import { kafka } from "./kafka.client.js";

let producer: Producer | null = null;

/** Exposed for graceful shutdown. */
export function getProducer(): Producer {
    if (!producer) {
        throw new Error("Gateway Kafka producer not initialized. Call initProducer() first.");
    }
    return producer;
}

export const initProducer = async (): Promise<Producer> => {
    if (producer) return producer;

    producer = kafka.producer();

    let retries = 10;
    while (retries > 0) {
        try {
            await producer.connect();
            console.log("✅ Gateway Kafka Producer connected");
            return producer;
        } catch (err: any) {
            retries--;
            console.warn("⏳ Gateway Kafka producer retrying...", retries, err.message);
            await new Promise((res) => setTimeout(res, 3000));
        }
    }

    throw new Error("❌ Gateway Kafka Producer failed to connect after retries");
};

const sendRaw = async (topic: string, key: string, value: unknown): Promise<void> => {
    if (!producer) throw new Error("Kafka producer not initialized");
    await producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(value) }],
    });
};

export const publishEvent = async (event: BaseEvent): Promise<void> => {
    const topic = resolveTopic(event.event_type);
    await sendRaw(topic, event.user_id, event);
    console.log(`📤 Published ${event.event_type} → ${topic}`);
};

const resolveTopic = (eventType: string): string => {
    switch (eventType) {
        case "session.completed.v1":
            return TOPICS.SESSION_COMPLETED;

        case "lesson.completed.v1":
            return TOPICS.LESSON_COMPLETED;

        default:
            throw new Error(`Unknown event type: ${eventType}`);
    }
};

export const shutdownProducer = async (): Promise<void> => {
    if (!producer) return;
    await producer.disconnect();
    producer = null;
    console.log("🛑 Gateway Kafka Producer disconnected");
};