import type { Consumer } from "kafkajs";
import { kafka } from "./kafka.client.js";
import { pgPool } from "../db/index.js";
import { connectWithRetry, TOPICS, UserDeletedEventSchema, UserRegisteredEventSchema } from "@langphy/shared";

const serviceName = process.env.SERVICE_NAME || "profile-service";
const consumerGroupId = `${serviceName}-group`;

export const consumer: Consumer = kafka.consumer({
    groupId: consumerGroupId,
});

let running = false;

/**
 * Starts the profile event consumers.
 *
 * Each event is processed inside a single Postgres transaction:
 *   - idempotency check (event_inbox)
 *   - business write (profile create/delete, deleted_users record)
 *   - event_inbox insert
 * If any step fails the whole transaction rolls back and the error is
 * rethrown, so Kafka does NOT commit the offset and the event is retried.
 */
export const startProfileConsumers = async () => {
    await connectWithRetry(consumer, serviceName);

    await consumer.subscribe({ topic: TOPICS.USER_REGISTERED });
    await consumer.subscribe({ topic: TOPICS.USER_DELETED });

    console.log(`[${serviceName}] Kafka consumer subscribed`);

    running = true;

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            if (!message?.value) return;

            const raw = JSON.parse(message.value.toString());

            if (topic === TOPICS.USER_DELETED) {
                const event = UserDeletedEventSchema.parse(raw);
                const client = await pgPool.connect();
                try {
                    await client.query("BEGIN");

                    const existing = await client.query(
                        `SELECT event_id FROM event_inbox WHERE event_id = $1`,
                        [event.event_id]
                    );
                    if (existing.rows[0]) {
                        await client.query("COMMIT");
                        return;
                    }

                    await client.query(
                        `INSERT INTO deleted_users (user_id, deleted_at)
                         VALUES ($1, NOW())
                         ON CONFLICT (user_id) DO NOTHING`,
                        [event.user_id]
                    );

                    await client.query(
                        `DELETE FROM lp_profiles WHERE user_id = $1`,
                        [event.user_id]
                    );

                    await client.query(
                        `INSERT INTO event_inbox (
                            event_id, event_type, event_version, user_id, occurred_at, payload
                        ) VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            event.event_id,
                            event.event_type,
                            event.event_version,
                            event.user_id,
                            event.occurred_at.toISOString(),
                            JSON.stringify(event.payload),
                        ]
                    );

                    await client.query("COMMIT");
                    console.log("🗑 Profile deleted for:", event.user_id);
                } catch (err) {
                    await client.query("ROLLBACK").catch(() => {});
                    console.error("Profile deletion failed (will retry):", err);
                    // Rethrow so Kafka does not commit the offset — event will be redelivered.
                    throw err;
                } finally {
                    client.release();
                }
            }

            if (topic === TOPICS.USER_REGISTERED) {
                const event = UserRegisteredEventSchema.parse(raw);
                const client = await pgPool.connect();
                try {
                    await client.query("BEGIN");

                    const existing = await client.query(
                        `SELECT event_id FROM event_inbox WHERE event_id = $1`,
                        [event.event_id]
                    );
                    if (existing.rows[0]) {
                        await client.query("COMMIT");
                        return;
                    }

                    await client.query(
                        `INSERT INTO lp_profiles (user_id, username)
                         VALUES ($1, $2)
                         ON CONFLICT (user_id) DO NOTHING`,
                        [event.user_id, event.payload.email]
                    );

                    await client.query(
                        `INSERT INTO event_inbox (
                            event_id, event_type, event_version, user_id, occurred_at, payload
                        ) VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            event.event_id,
                            event.event_type,
                            event.event_version,
                            event.user_id,
                            event.occurred_at.toISOString(),
                            JSON.stringify(event.payload),
                        ]
                    );

                    await client.query("COMMIT");
                    console.log("✅ Profile created for user:", event.user_id);
                } catch (err) {
                    await client.query("ROLLBACK").catch(() => {});
                    console.error("Profile creation failed (will retry):", err);
                    // Rethrow so Kafka does not commit the offset — event will be redelivered.
                    throw err;
                } finally {
                    client.release();
                }
            }
        },
    });
};

/**
 * Stops the Kafka consumer gracefully. Safe to call multiple times;
 * no-op if the consumer never started.
 */
export const stopProfileConsumers = async (): Promise<void> => {
    if (!running) return;
    running = false;
    try {
        await consumer.stop();
        await consumer.disconnect();
        console.log("Kafka Profile Consumer disconnected");
    } catch (err) {
        console.error("Kafka Profile Consumer disconnect failed:", err);
    }
};
