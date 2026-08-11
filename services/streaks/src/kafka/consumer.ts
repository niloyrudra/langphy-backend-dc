import { kafka } from "./kafka.client.js";
import { connectWithRetry } from "@langphy/shared";
import {
    SessionCompletedEventSchema,
    UserDeletedEventSchema,
    type SessionCompletedEvent,
    type UserDeletedEvent,
} from "@langphy/shared";
import { topicHandlerMap, type HandlerContext } from "./handler-registry.js";

const serviceName = process.env.SERVICE_NAME || "streaks-service";
const consumerGroupId = `${serviceName}-group`;

export const consumer = kafka.consumer({
    groupId: consumerGroupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    maxBytesPerPartition: 1_048_576,
    retry: { retries: 5 },
});

export const initConsumer = async () => {
    await connectWithRetry(consumer, serviceName);

    await consumer.subscribe({
        topic: "session.completed.v1",
        fromBeginning: false,
    });
    await consumer.subscribe({
        topic: "user.deleted.v1",
        fromBeginning: false,
    });

    await consumer.run({
        // We commit offsets MANUALLY after a handler returns successfully.
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
            const offset = message.offset;
            const rawValue = message.value?.toString();

            if (!rawValue) {
                console.warn(
                    `[streaks-consumer] empty message on ${topic}; skipping`,
                );
                // No data to process; safe to advance the offset.
                await commit(topic, partition, offset);
                return;
            }

            const ctx: HandlerContext = { topic, partition, offset };

            let raw: unknown;
            try {
                raw = JSON.parse(rawValue);
            } catch (parseErr) {
                // Malformed JSON — log + skip. Re-delivery would never
                // fix this.
                console.error(
                    `[streaks-consumer] malformed JSON on ${topic}, dropping:`,
                    parseErr,
                );
                await commit(topic, partition, offset);
                return;
            }

            const handler = topicHandlerMap[topic];
            if (!handler) {
                console.warn(
                    `[streaks-consumer] no handler for ${topic}; skipping`,
                );
                await commit(topic, partition, offset);
                return;
            }

            try {
                if (topic === "session.completed.v1") {
                    const event = SessionCompletedEventSchema.parse(raw);
                    await handler.handle(event, ctx);
                } else if (topic === "user.deleted.v1") {
                    const event = UserDeletedEventSchema.parse(raw);
                    await handler.handle(event, ctx);
                } else {
                    console.warn(
                        `[streaks-consumer] unhandled topic ${topic}; skipping`,
                    );
                }
                // Successful handler → safe to commit.
                await commit(topic, partition, offset);
            } catch (err) {
                // Schema parse error or handler failure. DO NOT commit —
                // let Kafka re-deliver. We still log the raw payload so
                // a DLQ-style investigation is possible.
                console.error(
                    `[streaks-consumer] handler failed for ${topic} at ${partition}:${offset}:`,
                    err,
                );
                console.error(
                    `[streaks-consumer] raw message: ${rawValue}`,
                );
                // Re-throw so the consumer's retry/backoff kicks in for
                // transient errors. Schema errors will keep failing —
                // that's the cost of having no DLQ; future work can add
                // one (TOPICS.STREAK_UPDATED_DLQ already exists).
                throw err;
            }
        },
    });
};

/**
 * Commit the offset for a single (topic, partition) using the
 * "next-offset" convention: Kafka expects the offset of the NEXT
 * message to consume, not the one we just processed.
 */
async function commit(
    topic: string,
    partition: number,
    offset: string,
): Promise<void> {
    const next = (BigInt(offset) + 1n).toString();
    await consumer.commitOffsets([
        { topic, partition, offset: next },
    ]);
}

// Keep type-only exports so handler files can still reference these
// symbols if they need to.
export type { SessionCompletedEvent, UserDeletedEvent };
