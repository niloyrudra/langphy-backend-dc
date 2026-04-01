import { pgPool } from "../db/index.js";

type ProgressEventIndexInput = {
    event_id: string;
    event_type: string;
    event_version: number;
    user_id: string;
    occurred_at: string | number;
    payload: unknown;
};

export class EventIndexModel {
    static async exists( eventId: string ): Promise<boolean> {
        try {
            const result = await pgPool.query(
                `SELECT event_id FROM event_inbox WHERE event_id = $1`,
                [eventId]
            );

            return !!result.rows[0];
        }
        catch(error) {
            console.error("EventIndexModel exists error:", error);
            return false;
        }
    }

    static async markProcessed( input: ProgressEventIndexInput ) {
        try {
            await pgPool.query(
                `INSERT INTO event_inbox (
                    event_id,
                    event_type,
                    event_version,
                    user_id,
                    occurred_at,
                    payload
                )
                VALUES ($1, $2, $3, $4, $5, $6)`,
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
        catch(error) {
            console.error("Progress EventInbox markProcessed error:", error);
        }
    }
};