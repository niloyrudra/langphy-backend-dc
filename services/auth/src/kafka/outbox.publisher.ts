import type { Producer } from "kafkajs";
import { TOPICS } from "@langphy/shared";
import { pgPool } from "../db/index.js";
import { OutboxRepo, type OutboxRow } from "../repos/outbox.repo.js";

/**
 * In-process outbox publisher.
 *
 * Periodically polls `outbox_events` for unpublished rows, sends each to
 * the appropriate Kafka topic, and marks them published — all in one
 * transaction so a crash mid-batch leaves the rows claimable on the next
 * pass.
 *
 * Single-instance only today. Multi-instance safety comes from
 * `FOR UPDATE SKIP LOCKED` in OutboxRepo.fetchPending — when you scale
 * out, just deploy another auth replica and this code stays correct.
 */

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;

const EVENT_TYPE_TO_TOPIC: Record<string, string> = {
    "user.registered.v1": TOPICS.USER_REGISTERED,
    "user.deleted.v1": TOPICS.USER_DELETED,
};

interface OutboxPublisherHandle {
    stop: () => Promise<void>;
}

let handle: OutboxPublisherHandle | null = null;

export function startOutboxPublisher(producer: Producer): OutboxPublisherHandle {
    if (handle) {
        console.warn("[outbox] publisher already started, ignoring duplicate start");
        return handle;
    }

    let running = true;
    let timer: NodeJS.Timeout | null = null;

    const tick = async () => {
        if (!running) return;
        try {
            await pollOnce(producer);
        } catch (err) {
            console.error("[outbox] poll cycle failed:", err);
        }
        if (running) {
            timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
    };

    // Kick the first cycle immediately so signup-then-consume has low latency.
    timer = setTimeout(tick, 0);

    handle = {
        stop: async () => {
            running = false;
            if (timer) clearTimeout(timer);
            // Wait for the in-flight tick to settle (best effort)
            await new Promise((r) => setTimeout(r, 100));
            handle = null;
            console.log("[outbox] publisher stopped");
        },
    };

    console.log(`[outbox] publisher started (interval=${POLL_INTERVAL_MS}ms, batch=${BATCH_SIZE})`);
    return handle;
}

export async function stopOutboxPublisher(): Promise<void> {
    if (handle) {
        await handle.stop();
    }
}

async function pollOnce(producer: Producer): Promise<void> {
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        const rows = await OutboxRepo.fetchPending(client, BATCH_SIZE);
        if (rows.length === 0) {
            await client.query("COMMIT");
            return;
        }

        const published: string[] = [];
        const failed: string[] = [];

        for (const row of rows) {
            const topic = EVENT_TYPE_TO_TOPIC[row.event_type];
            if (!topic) {
                console.warn(`[outbox] unknown event_type "${row.event_type}", skipping row ${row.id}`);
                failed.push(row.id);
                continue;
            }

            try {
                await producer.send({
                    topic,
                    messages: [
                        {
                            key: row.aggregate_id,
                            value: JSON.stringify(row.payload),
                        },
                    ],
                });
                published.push(row.id);
            } catch (err) {
                console.error(`[outbox] Kafka send failed for row ${row.id} (${row.event_type}):`, err);
                failed.push(row.id);
            }
        }

        if (published.length > 0) {
            await OutboxRepo.markPublished(client, published);
        }
        for (const id of failed) {
            // Don't increment retry_count forever — that's the table's job.
            // We bump only on send failure, not on skip (unknown event_type).
            await OutboxRepo.bumpRetryCount(client, id);
        }

        await client.query("COMMIT");
        if (published.length > 0) {
            console.log(`[outbox] published ${published.length} event(s)${failed.length ? `, ${failed.length} failed` : ""}`);
        }
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}