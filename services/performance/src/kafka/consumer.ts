import {
    connectWithRetry,
    SessionCompletedEventSchema,
    TOPICS,
    UserDeletedEventSchema,
    type SessionCompletedEvent,
    type UserDeletedEvent,
} from "@langphy/shared";
import { kafka } from "./kafka.client.js";
import { pgPool } from "../db/index.js";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { handleSessionCompleted } from "../services/performance.service.js";
import { SessionPerformanceRepo } from "../repos/sessionPerformance.repo.js";
import { SessionAttemptRepo } from "../repos/attempt.repo.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const serviceName = process.env.SERVICE_NAME || 'performance-service';
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
        topic: TOPICS.SESSION_COMPLETED,
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
                console.warn(`[performance-consumer] empty message on ${topic}; skipping`);
                await commit(topic, partition, offset);
                return;
            }

            let raw: unknown;
            try {
                raw = JSON.parse(rawValue);
            } catch (parseErr) {
                // Malformed JSON — log + skip. Re-delivery would never fix this.
                console.error(`[performance-consumer] malformed JSON on ${topic}, dropping:`, parseErr);
                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.SESSION_COMPLETED ) {
                const event = SessionCompletedEventSchema.safeParse(raw);

                if ( !event.success ) {
                    // Schema mismatch — unprocessable; log + skip to avoid a retry loop.
                    console.error(`[performance-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[performance-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleSessionCompletedEvent(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[performance-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[performance-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.safeParse(raw);

                if ( !event.success ) {
                    console.error(`[performance-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[performance-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleUserDeletedEvent(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[performance-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[performance-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            // Subscribed topics are exhaustive; safety net for stray messages.
            console.warn(`[performance-consumer] no handler for ${topic}; skipping`);
            await commit(topic, partition, offset);
        }
    });
};
/**
 * Applies a session.completed.v1 event exactly once.
 *
 * The idempotency check, tombstone check, business write and event_inbox
 * insert all happen inside a SINGLE Postgres transaction. If any step
 * fails, the transaction is rolled back and the error is rethrown so
 * Kafka re-delivers.
 */
const handleSessionCompletedEvent = async ( event: SessionCompletedEvent ) => {
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
            await EventIndexModel.markProcessed( toInboxInput( event ), client );
            await client.query("COMMIT");
            return;
        }

        // Business write (attempt insert + performance upsert).
        await handleSessionCompleted({
            user_id: event.user_id,
            unit_id: event.payload.unit_id,
            session_type: event.payload.session_type,
            session_key: event.payload.session_key,
            score: event.payload.score ?? 0,
            attempts: event.payload.attempts ?? 0,
            total_duration_ms: event.payload.total_duration_ms,
            completed_at: event.payload.completed_at,
        }, client);

        // (No active publisher today — a PERFORMANCE_UPDATED emit would
        // happen here, after the DB work above is committed.)

        // Mark processed — same tx as the write.
        await EventIndexModel.markProcessed( toInboxInput( event ), client );

        await client.query("COMMIT");
        console.log(`✅ Session performance applied for user ${event.user_id} (${event.payload.session_type})`);
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
 * performance + attempt rows in one transaction.
 */
const handleUserDeletedEvent = async ( event: UserDeletedEvent ) => {
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");

        // Idempotency — inside the tx so it is atomic with the write.
        if ( await EventIndexModel.exists( event.event_id, client ) ) {
            await client.query("COMMIT");
            return;
        }

        await DeletedUsersRepo.insert( event.user_id, client );
        await SessionPerformanceRepo.deleteSessionPerformanceByUserId( event.user_id, client );
        await SessionAttemptRepo.deleteSessionAttemptsByUserId( event.user_id, client );

        await EventIndexModel.markProcessed( toInboxInput( event ), client );

        await client.query("COMMIT");
        console.log( "🗑 Session Performance deleted for:", event.user_id );
    }
    catch(error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    }
    finally {
        client.release();
    }
};

/** Reduces a parsed event to the event_inbox row shape (occurred_at → ISO). */
const toInboxInput = ( event: SessionCompletedEvent | UserDeletedEvent ) => ({
    event_id: event.event_id,
    event_type: event.event_type,
    event_version: event.event_version,
    user_id: event.user_id,
    occurred_at: new Date(event.occurred_at).toISOString(),
    payload: event.payload,
});

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
        console.log("Kafka Performance Consumer disconnected");
    } catch (err) {
        console.error("Kafka Performance Consumer disconnect failed:", err);
    }
};