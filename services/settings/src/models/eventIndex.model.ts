import { type Pool } from "pg";
import { pgPool } from "../db/index.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

type SettingsEventIndexInput = {
    event_id: string;
    event_type: string;
    event_version: number;
    user_id: string;
    occurred_at: string | number;
    payload: unknown;
};

export class EventIndexModel {
    /**
     * @param client optional transactional client. Errors PROPAGATE so the
     * consumer's surrounding transaction can ROLLBACK.
     */
    static async exists( eventId: string, client: Queryable = pgPool ): Promise<boolean> {
        const result = await client.query(
            `SELECT event_id FROM event_inbox WHERE event_id = $1`,
            [eventId]
        );

        return !!result.rows[0];
    }

    /**
     * @param client optional transactional client. Errors PROPAGATE so the
     * consumer's surrounding transaction can ROLLBACK.
     */
    static async markProcessed( input: SettingsEventIndexInput, client: Queryable = pgPool ) {
        await client.query(
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
                input.occurred_at,
                JSON.stringify( input.payload ),
            ]
        );
    }
};