import { pgPool } from "../db/index.js";

export type StreakEventIndexInput = {
    event_id: string;
    event_type: string;
    event_version: number;
    user_id: string;
    occurred_at: string | Date;
    payload: unknown;
};

/**
 * Idempotency tracking for the Kafka consumer. Each successfully
 * processed event is recorded by `event_id` (the unique key from the
 * producer). On re-delivery, the consumer checks `exists` and skips
 * without re-applying side effects.
 *
 * Errors are NOT swallowed — the consumer needs to know if the DB
 * write failed so it can avoid committing the offset.
 */
export class EventIndexModel {
    static async exists(eventId: string): Promise<boolean> {
        const result = await pgPool.query(
            `SELECT 1 FROM event_inbox WHERE event_id = $1`,
            [eventId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    static async markProcessed(input: StreakEventIndexInput): Promise<void> {
        // Normalize occurred_at to a Date object so the TIMESTAMPTZ column
        // gets a well-defined value regardless of the input shape.
        const occurredAt =
            input.occurred_at instanceof Date
                ? input.occurred_at
                : new Date(input.occurred_at);

        if (isNaN(occurredAt.getTime())) {
            throw new Error(
                `EventIndexModel.markProcessed: invalid occurred_at for event ${input.event_id}`,
            );
        }

        await pgPool.query(
            `INSERT INTO event_inbox (
                event_id,
                event_type,
                event_version,
                user_id,
                occurred_at,
                payload
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                input.event_id,
                input.event_type,
                input.event_version,
                input.user_id,
                occurredAt,
                JSON.stringify(input.payload),
            ],
        );
    }
}
