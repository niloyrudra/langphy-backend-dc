import { randomUUID } from "crypto";
import {
    connectWithRetry,
    LessonCompletedEventSchema,
    TOPICS,
    UserDeletedEventSchema,
    type LessonCompletedEvent,
    type ProgressUpdatedEvent,
    type UserDeletedEvent,
} from "@langphy/shared";
import { kafka } from "./kafka.client.js";
import { pgPool } from "../db/index.js";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { ProgressRepo } from "../repos/progress.repo.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";
import { publishProgressUpdated } from "./producer.js";

const serviceName = process.env.SERVICE_NAME! ? process.env.SERVICE_NAME : 'progress-service';
const consumerGroupId = serviceName + '-group';

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
        topic: TOPICS.LESSON_COMPLETED,
        fromBeginning: false
    });

    await consumer.subscribe({
        topic: TOPICS.USER_DELETED,
        fromBeginning: false
    });

    console.log(`[${serviceName}] Kafka consumer subscribed`);

    await consumer.run({
        // We commit offsets MANUALLY after a handler returns successfully.
        autoCommit: false,
        eachMessage: async ({topic, partition, message}) => {
            const offset = message.offset;
            const rawValue = message.value?.toString();

            if (!rawValue) {
                console.warn(`[progress-consumer] empty message on ${topic}; skipping`);
                await commit(topic, partition, offset);
                return;
            }

            let raw: unknown;
            try {
                raw = JSON.parse(rawValue);
            } catch (parseErr) {
                // Malformed JSON — log + skip. Re-delivery would never fix this.
                console.error(`[progress-consumer] malformed JSON on ${topic}, dropping:`, parseErr);
                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.LESSON_COMPLETED ) {
                const event = LessonCompletedEventSchema.safeParse(raw);

                if ( !event.success ) {
                    // Schema mismatch — unprocessable; log + skip to avoid a retry loop.
                    console.error(`[progress-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[progress-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleLessonCompleted(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[progress-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[progress-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.safeParse(raw);

                if ( !event.success ) {
                    console.error(`[progress-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[progress-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleUserDeleted(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[progress-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[progress-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            // Subscribed topics are exhaustive; safety net for stray messages.
            console.warn(`[progress-consumer] no handler for ${topic}; skipping`);
            await commit(topic, partition, offset);
        }
    });
};

/**
 * Applies a lesson.completed.v1 event exactly once.
 *
 * The idempotency check, tombstone check, business write and event_inbox
 * insert all happen inside a SINGLE Postgres transaction. If any step
 * fails, the transaction is rolled back and the error is rethrown so
 * Kafka re-delivers. The progress.updated.v1 notification is published
 * ONLY after COMMIT — it is best-effort (a Kafka hiccup must never roll
 * back durable progress).
 */
const handleLessonCompleted = async ( event: LessonCompletedEvent ) => {
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");

        // Idempotency — inside the tx so it is atomic with the write.
        if ( await EventIndexModel.exists( event.event_id, client ) ) {
            await client.query("COMMIT");
            return;
        }

        // Tombstone — deleted users must not be resurrected by late events.
        if ( await DeletedUsersRepo.exists( event.user_id, client ) ) {
            await EventIndexModel.markProcessed(
                { ...event, occurred_at: new Date().toISOString() },
                client
            );
            await client.query("COMMIT");
            return;
        }

        // Apply Progress logic
        const result = await ProgressRepo.applyActivity(
            {
                category_id: event.payload.category_id,
                unit_id: event.payload.unit_id,
                user_id: event.user_id,
                content_type: event.payload.session_type, // "quiz" | "practice" | "reading" | "writing" | "speaking" | "listening"
                content_id: event.payload.lesson_id,
                session_key: event.payload.session_key,
                lesson_order: event.payload.lesson_order,
                completed: event.payload.completed,
                score: event.payload.score ?? 0,
                duration_ms: event.payload.duration_ms,
                progress_percent: event.payload.progress_percent
            },
            client
        );

        // Mark processed — same tx as the write.
        await EventIndexModel.markProcessed(
            { ...event, occurred_at: new Date().toISOString() },
            client
        );

        await client.query("COMMIT");

        // Emit only if meaningful change — AFTER the commit.
        if ( result.updated && result.progress ) {
            try {
                await publishProgressUpdated(
                    toProgressUpdatedEvent( event, result.progress )
                );
            }
            catch(publishErr) {
                console.error(
                    `[progress-consumer] progress.updated publish failed for ${event.user_id}:`,
                    publishErr
                );
            }
        }

        console.log(`✅ Progress applied for user ${event.user_id} (${event.payload.session_type})`);
    }
    catch(error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    }
    finally {
        client.release();
    }
};

/**
 * Handles user.deleted.v1: tombstones the user and deletes all their
 * progress rows in one transaction.
 */
const handleUserDeleted = async ( event: UserDeletedEvent ) => {
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");

        // Idempotency — inside the tx so it is atomic with the write.
        if ( await EventIndexModel.exists( event.event_id, client ) ) {
            await client.query("COMMIT");
            return;
        }

        await DeletedUsersRepo.insert( event.user_id, client );
        await ProgressRepo.deleteProgress( event.user_id, client );

        await EventIndexModel.markProcessed(
            { ...event, occurred_at: new Date().toISOString() },
            client
        );

        await client.query("COMMIT");

        console.log( "🗑 Progress deleted for:", event.user_id );
    }
    catch(error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    }
    finally {
        client.release();
    }
};

/**
 * Maps a freshly-upserted lp_progress row + the source lesson.completed
 * event into a progress.updated.v1 envelope.
 */
const toProgressUpdatedEvent = (
    source: LessonCompletedEvent,
    progress: any
): ProgressUpdatedEvent => {
    return {
        event_id: randomUUID(),
        event_type: "progress.updated.v1",
        event_version: 1,
        occurred_at: new Date().toISOString(),
        user_id: source.user_id,
        payload: {
            category_id: progress.category_id,
            unit_id: progress.unit_id,
            session_key: progress.session_key,
            lesson_id: progress.content_id,
            session_type: progress.content_type,
            lesson_order: progress.lesson_order,
            completed: progress.completed,
            duration_ms: progress.duration_ms,
            progress_percent: progress.progress_percent,
            score: progress.score,
        },
    };
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

/**
 * Stops the Kafka consumer gracefully. Safe to call multiple times;
 * no-op if the consumer never started.
 */
export const stopConsumer = async () => {
    try {
        await consumer.stop();
        await consumer.disconnect();
        console.log("Kafka Progress Consumer disconnected");
    } catch (err) {
        console.error("Kafka Progress Consumer disconnect failed:", err);
    }
};
