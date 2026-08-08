import type { PoolClient } from "pg";

/**
 * Outbox row shape. Mirrors the `outbox_events` table created in
 * services/auth/src/db/migrations/002_outbox_events.sql.
 *
 * `payload` is stored as JSONB; the publisher re-parses it back into
 * a BaseEvent envelope before sending to Kafka.
 */
export interface OutboxRow {
    id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    occurred_at: Date;
    published: boolean;
    published_at: Date | null;
    retry_count: number;
}

export class OutboxRepo {
    /**
     * Enqueue an event in the OUTBOX within an existing transaction.
     * The caller is responsible for BEGIN/COMMIT — that's how we make
     * "publish to Kafka" atomic with the business write.
     *
     * `event` is the BaseEvent envelope (event_id, event_type, event_version,
     * occurred_at, user_id, payload). We map event_id → outbox `id` (UUID),
     * aggregate_type ← "user", aggregate_id ← event.user_id, payload ←
     * the entire envelope so the publisher can rehydrate it.
     */
    static async enqueue(
        client: PoolClient,
        event: {
            event_id: string;
            event_type: string;
            event_version: number;
            occurred_at: Date;
            user_id: string;
            payload: Record<string, unknown>;
        }
    ): Promise<void> {
        await client.query(
            `INSERT INTO outbox_events
                (id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                event.event_id,
                "user",
                event.user_id,
                event.event_type,
                event,
                event.occurred_at,
            ]
        );
    }

    /**
     * Fetch a batch of pending events for publishing.
     * Uses `FOR UPDATE SKIP LOCKED` so multiple workers (in future horizontal
     * scale-out) can poll concurrently without claiming the same rows.
     * The caller MUST wrap this in BEGIN/COMMIT and mark rows published
     * inside the same transaction.
     */
    static async fetchPending(client: PoolClient, limit: number): Promise<OutboxRow[]> {
        const result = await client.query<OutboxRow>(
            `SELECT id, aggregate_type, aggregate_id, event_type, payload,
                    occurred_at, published, published_at, retry_count
             FROM outbox_events
             WHERE published = false
             ORDER BY occurred_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED`,
            [limit]
        );
        return result.rows;
    }

    static async markPublished(client: PoolClient, ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        await client.query(
            `UPDATE outbox_events
             SET published = true,
                 published_at = NOW(),
                 retry_count = retry_count + 1
             WHERE id = ANY($1::uuid[])`,
            [ids]
        );
    }

    static async bumpRetryCount(client: PoolClient, id: string): Promise<void> {
        await client.query(
            `UPDATE outbox_events
             SET retry_count = retry_count + 1
             WHERE id = $1`,
            [id]
        );
    }
}