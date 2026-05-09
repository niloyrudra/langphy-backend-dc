import { TOPICS, type UserDeletedEvent, type UserRegisteredEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";

let producer: ReturnType<typeof kafka.producer> | null = null;

export const initProducer = async () => {
    let retries = 10;
    producer = kafka.producer();

    while (retries > 0) {
        try {
            await producer.connect();
            console.log("✅ Auth Kafka Producer connected");
            return;
        } catch (err: any) {
            console.log("⏳ Auth Kafka not ready, retrying...", err.message);
            retries--;
            await new Promise(res => setTimeout(res, 3000));
        }
    }

    throw new Error("❌ Auth Kafka not ready after retries");
};

const send = async (topic: string, event: { user_id: string }) => {
    if (!producer) throw new Error("Auth Kafka producer not initialized");
    await producer.send({
        topic,
        messages: [{ key: event.user_id, value: JSON.stringify(event) }],
    });
};

// ✅ Each publisher routes to its correct topic explicitly
export const publishUserRegistered = async (event: UserRegisteredEvent) =>
    send(TOPICS.USER_REGISTERED, event);

export const publishUserDeleted = async (event: UserDeletedEvent) =>
    send(TOPICS.USER_DELETED, event);