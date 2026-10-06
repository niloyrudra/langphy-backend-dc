import { TOPICS, type VocabSessionCompletedEvent, type VocabWordMasteredEvent, type VocabAchievementUnlockedEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";

/**
 * Initialised by `initProducer()`.
 */
export const producer = kafka.producer();

let started = false;

export const initProducer = async () => {
    if (started) return;
    await producer.connect();
    started = true;
    console.log(
        `[${process.env.SERVICE_NAME || "vocab-arena-service"}] Kafka producer connected`,
    );
};

export const shutdownProducer = async () => {
    if (!started) return;
    await producer.disconnect();
    started = false;
    console.log(
        `[${process.env.SERVICE_NAME || "vocab-arena-service"}] Kafka producer disconnected`,
    );
};

export const publishVocabSessionCompleted = async (event: VocabSessionCompletedEvent) => {
    await producer.send({
        topic: TOPICS.VOCAB_SESSION_COMPLETED,
        messages: [{ key: event.user_id, value: JSON.stringify(event) }],
    });
};

export const publishVocabWordMastered = async (event: VocabWordMasteredEvent) => {
    await producer.send({
        topic: TOPICS.VOCAB_WORD_MASTERED,
        messages: [{ key: event.user_id, value: JSON.stringify(event) }],
    });
};

export const publishVocabAchievementUnlocked = async (event: VocabAchievementUnlockedEvent) => {
    await producer.send({
        topic: TOPICS.VOCAB_ACHIEVEMENT_UNLOCKED,
        messages: [{ key: event.user_id, value: JSON.stringify(event) }],
    });
};