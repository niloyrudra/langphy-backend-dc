import { TOPICS, type UserDeletedEvent, type UserRegisteredEvent } from "@langphy/shared";
import type { Producer } from "kafkajs";
import { kafka } from "./kafka.client.js";

let producer: Producer | null = null;

/** Exposed for the outbox publisher and for graceful shutdown. */
export function getProducer(): Producer {
    if (!producer) {
        throw new Error("Auth Kafka producer not initialized. Call initProducer() first.");
    }
    return producer;
}

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
            await new Promise((res) => setTimeout(res, 3000));
        }
    }

    throw new Error("❌ Auth Kafka not ready after retries");
};

// ─────────────────────────────────────────────────────────────────────────
// Domain-specific publishers. These write to the OUTBOX TABLE — they do NOT
// call producer.send() directly. The outbox publisher (outbox.publisher.ts)
// drains the table and sends to Kafka durably.
//
// Keeping these helpers around so existing call sites in controllers continue
// to work — they now mean "enqueue in outbox" rather than "publish to Kafka".
// ─────────────────────────────────────────────────────────────────────────

interface OutboxWriter {
    enqueueEvent(event: {
        event_id: string;
        event_type: string;
        event_version: number;
        occurred_at: Date;
        user_id: string;
        payload: Record<string, unknown>;
    }): Promise<void>;
}

let outboxWriter: OutboxWriter | null = null;

/**
 * Wire up the outbox writer. Called once from index.ts AFTER the DB pool is
 * ready and BEFORE startOutboxPublisher(). Controllers that call
 * publishUserRegistered / publishUserDeleted route through this writer.
 */
export function setOutboxWriter(writer: OutboxWriter): void {
    outboxWriter = writer;
}

async function ensureOutboxWriter(): Promise<OutboxWriter> {
    if (!outboxWriter) {
        throw new Error(
            "Outbox writer not wired. Call setOutboxWriter() in index.ts after pgPool is ready."
        );
    }
    return outboxWriter;
}

// Re-export the topic constants so the outbox publisher can map event_type → topic.
export { TOPICS };

/** Enqueue a user.registered.v1 event in the outbox. */
export const publishUserRegistered = async (event: UserRegisteredEvent): Promise<void> => {
    const writer = await ensureOutboxWriter();
    await writer.enqueueEvent({
        event_id: event.event_id,
        event_type: event.event_type,
        event_version: event.event_version,
        occurred_at: event.occurred_at,
        user_id: event.user_id,
        payload: event.payload as unknown as Record<string, unknown>,
    });
};

/** Enqueue a user.deleted.v1 event in the outbox. */
export const publishUserDeleted = async (event: UserDeletedEvent): Promise<void> => {
    const writer = await ensureOutboxWriter();
    await writer.enqueueEvent({
        event_id: event.event_id,
        event_type: event.event_type,
        event_version: event.event_version,
        occurred_at: event.occurred_at,
        user_id: event.user_id,
        payload: event.payload as unknown as Record<string, unknown>,
    });
};