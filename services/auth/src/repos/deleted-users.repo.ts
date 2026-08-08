import type { PoolClient } from "pg";
import { pgPool } from "../db/index.js";
import { DeletedUsersModel } from "../models/deleted-users.model.js";
import { OutboxRepo } from "./outbox.repo.js";

/**
 * Tombstone record. Written when an account is deleted so we can detect
 * "this email was previously used" during signin and block re-registration
 * attempts. Mirrors the `deleted_users` table.
 */
export interface DeletedUserRecord {
    user_id: string;
    deleted_at: Date;
}

export class DeletedUsersRepo {
    /** @deprecated kept for symmetry with the legacy model. Use softDeleteWithOutbox. */
    static async insert(user_id: string): Promise<void> {
        await DeletedUsersModel.insertDeletedUser(user_id);
    }

    static async exists(user_id: string): Promise<boolean> {
        return await DeletedUsersModel.exists(user_id);
    }

    /**
     * Atomically:
     *   1. delete the user row
     *   2. write the tombstone
     *   3. enqueue a `user.deleted.v1` event in the outbox
     *
     * If any step fails, the entire transaction rolls back and no event is
     * produced — the user remains live, and we have no risk of "user is gone
     * but downstream services never knew."
     *
     * Takes a constructed envelope so the caller controls the event id (UUID v4)
     * and the `payload` shape. The caller MUST generate `event_id` before this
     * call so that retries of the entire HTTP request produce a new envelope
     * (idempotency happens at the outbox/consumer layer, not here).
     */
    static async softDeleteWithOutbox(
        userId: string,
        envelope: {
            event_id: string;
            event_type: "user.deleted.v1";
            event_version: 1;
            occurred_at: Date;
            user_id: string;
            payload: { reason?: string; deleted_by: "user" | "admin" | "system" };
        }
    ): Promise<void> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            // 1. delete the user; throw if not found so we roll back the tombstone
            const del = await client.query(
                `DELETE FROM lp_users WHERE id = $1`,
                [userId]
            );
            if (del.rowCount === 0) {
                throw new Error(`User not found: ${userId}`);
            }

            // 2. tombstone (idempotent — re-deleting an already-deleted user is fine)
            await client.query(
                `INSERT INTO deleted_users (user_id, deleted_at)
                 VALUES ($1, NOW())
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId]
            );

            // 3. outbox row — the publisher picks it up within ~2s
            await OutboxRepo.enqueue(client, envelope);

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Manual transaction helper for callers that need to compose multiple writes
     * (e.g. user.create + outbox.enqueue) in a single tx. Returns the connected
     * client; caller must call client.release() in finally.
     */
    static async beginTransaction(): Promise<PoolClient> {
        const client = await pgPool.connect();
        await client.query("BEGIN");
        return client;
    }
}