import { TOPICS } from "@langphy/shared";
import { sendRaw } from "./producer.js";
import type { RetryEnvelope } from "./retry-envelope.js";

const resolveTopic = (eventType: string): string => {
    switch (eventType) {
        case "user.registered":
        case "user.password.changed":
        case "user.signed-out":
        case "user.deleted":
            return TOPICS.USERS_EVENTS;

        default:
            throw new Error(`No topic mapping found for event type: ${eventType}`);
    }
};

export const publishToRetry = async (envelope: RetryEnvelope) => {
    await sendRaw(
        TOPICS.USERS_EVENTS_RETRY,
        envelope.original_event.user_id,
        envelope
    );
};

export const publishToDLQ = async (envelope: RetryEnvelope) => {
    await sendRaw(
        TOPICS.USERS_EVENTS_DLQ,
        envelope.original_event.user_id,
        envelope
    );
};