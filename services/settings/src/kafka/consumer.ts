import {
    connectWithRetry,
    SettingsUpdatedEventSchema,
    TOPICS,
    UserDeletedEventSchema,
    UserRegisteredEventSchema,
    type SettingsUpdatedEvent,
    type UserDeletedEvent,
    type UserRegisteredEvent,
} from "@langphy/shared";
import { kafka } from "./kafka.client.js";
import { pgPool } from "../db/index.js";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { SettingsModel } from "../models/settings.model.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const serviceName = process.env.SERVICE_NAME! ? process.env.SERVICE_NAME : 'settings-service';
const consumerGroupId = serviceName + '-group';

export const consumer = kafka.consumer({
    groupId: consumerGroupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    maxBytesPerPartition: 1_048_576,
    retry: { retries: 5 },
});

export const initSettingsConsumers = async () => {
    await connectWithRetry(consumer, serviceName);

    await consumer.subscribe({
        topic: TOPICS.USER_REGISTERED,
        fromBeginning: true
    });

    // NOTE: SETTINGS_UPDATED is intentionally NOT subscribed (matches the
    // current production behaviour — settings are written via the HTTP PUT
    // endpoint and this topic is normally produced by this very service).
    // The handler below remains wired as a safety net.
    // await consumer.subscribe({
    //     topic: TOPICS.SETTINGS_UPDATED,
    //     fromBeginning: false
    // });

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
                console.warn(`[settings-consumer] empty message on ${topic}; skipping`);
                await commit(topic, partition, offset);
                return;
            }

            let raw: unknown;
            try {
                raw = JSON.parse(rawValue);
            } catch (parseErr) {
                // Malformed JSON — log + skip. Re-delivery would never fix this.
                console.error(`[settings-consumer] malformed JSON on ${topic}, dropping:`, parseErr);
                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.SETTINGS_UPDATED ) {
                const event = SettingsUpdatedEventSchema.safeParse(raw);

                if ( !event.success ) {
                    // Schema mismatch — unprocessable; log + skip to avoid a retry loop.
                    console.error(`[settings-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[settings-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleSettingsUpdated(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[settings-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[settings-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.USER_REGISTERED ) {
                const event = UserRegisteredEventSchema.safeParse(raw);

                if ( !event.success ) {
                    console.error(`[settings-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[settings-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleUserRegistered(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[settings-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[settings-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.safeParse(raw);

                if ( !event.success ) {
                    console.error(`[settings-consumer] schema validation failed for ${topic}:`, event.error);
                    console.error(`[settings-consumer] raw message: ${rawValue}`);
                    await commit(topic, partition, offset);
                    return;
                }

                try {
                    await handleUserDeleted(event.data);
                } catch (err) {
                    // DB / transaction failure — DO NOT commit, so Kafka re-delivers.
                    console.error(`[settings-consumer] handler failed for ${topic} at ${partition}:${offset}:`, err);
                    console.error(`[settings-consumer] raw message: ${rawValue}`);
                    throw err;
                }

                await commit(topic, partition, offset);
                return;
            }

            // Subscribed topics are exhaustive; safety net for stray messages.
            console.warn(`[settings-consumer] no handler for ${topic}; skipping`);
            await commit(topic, partition, offset);
        }
    });
};
/**
 * Applies a settings.updated.v1 event exactly once.
 *
 * The idempotency check, tombstone check, business write and event_inbox
 * insert all happen inside a SINGLE Postgres transaction. If any step
 * fails, the transaction is rolled back and the error is rethrown so
 * Kafka re-delivers.
 *
 * NOTE: currently unreachable in production — TOPICS.SETTINGS_UPDATED is
 * intentionally not subscribed. Kept wired as a ready safety net.
 */
const handleSettingsUpdated = async ( event: SettingsUpdatedEvent ) => {
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

        const settings = await SettingsModel.updateSettings(
            event.user_id,
            {
                user_id: event.user_id,
                theme: event.payload.theme ?? "light",
                sound_effect: event.payload.sound_effect,
                speaking_service: event.payload.speaking_service,
                reading_service: event.payload.reading_service,
                writing_service: event.payload.writing_service,
                listening_service: event.payload.listening_service,
                practice_service: event.payload.practice_service,
                quiz_service: event.payload.quiz_service,
                notifications: event.payload.notifications,
                language: event.payload.language ?? "en",
            },
            client
        );

        // Mark processed — same tx as the write.
        await EventIndexModel.markProcessed( toInboxInput( event ), client );

        await client.query("COMMIT");

        if (settings) {
            console.log("✅ Settings updated for user:", event.user_id);
        } else {
            console.warn("⚠️ Settings update returned nothing (may already exist)");
        }
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
 * Seeds default settings for a newly-registered user exactly once.
 *
 * event_inbox check + tombstone check + createSettingsIfNotExists
 * (ON CONFLICT DO NOTHING) + event_inbox insert are atomic in one
 * transaction.
 */
const handleUserRegistered = async ( event: UserRegisteredEvent ) => {
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");

        // Idempotency — inside the tx so it is atomic with the write.
        if ( await EventIndexModel.exists( event.event_id, client ) ) {
            await client.query("COMMIT");
            return;
        }

        // Tombstone — a deleted user must never be re-provisioned.
        if ( await DeletedUsersRepo.exists( event.user_id, client ) ) {
            await EventIndexModel.markProcessed( toInboxInput( event ), client );
            await client.query("COMMIT");
            return;
        }

        const settings = await SettingsModel.createSettingsIfNotExists(
            event.user_id,
            client
        );

        // Mark processed — same tx as the write.
        await EventIndexModel.markProcessed( toInboxInput( event ), client );

        await client.query("COMMIT");

        if (settings) {
            console.log("✅ Settings created for user:", event.user_id);
        } else {
            console.log("Settings already exist for:", event.user_id);
        }
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
 * Handles user.deleted.v1: tombstones the user and deletes their settings
 * row in one transaction.
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
        await SettingsModel.deleteSettingsByUserIdTx( client, event.user_id );

        await EventIndexModel.markProcessed( toInboxInput( event ), client );

        await client.query("COMMIT");
        console.log( "🗑 Settings deleted for:", event.user_id );
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
const toInboxInput = (
    event: SettingsUpdatedEvent | UserRegisteredEvent | UserDeletedEvent
) => ({
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
export const stopSettingsConsumers = async () => {
    try {
        await consumer.stop();
        await consumer.disconnect();
        console.log("Kafka Settings Consumer disconnected");
    } catch (err) {
        console.error("Kafka Settings Consumer disconnect failed:", err);
    }
};