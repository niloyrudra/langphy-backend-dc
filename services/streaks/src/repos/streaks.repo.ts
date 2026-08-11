import type { PoolClient } from "pg";
import { pgPool } from "../db/index.js";
import { StreakModel, type StreakMilestone, type UserStreak } from "../models/streaks.model.js";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { DeletedUsersModel } from "../models/deleted-users.model.js";
import {
    celebrationFromMilestones,
    classifyDayDelta,
    daysBetween,
    todayInTz,
} from "../domain/streak-math.js";

const DEFAULT_TZ = "Europe/Berlin";

export interface ApplyActivityResult {
    updated: boolean;
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string;
    celebration: string | null;
    is_active: boolean;
}

export interface ApplyActivityArgs {
    userId: string;
    occurredAt?: Date;
}

/**
 * Transactional wrapper around the streak read+write path.
 *
 * One BEGIN/COMMIT block:
 *   1. ensure a row exists for the user (upsert)
 *   2. run the day-delta UPDATE (single SQL, atomic)
 *   3. mark the event processed (event_inbox INSERT)
 *
 * If any step fails, the transaction rolls back AND we re-throw. The
 * consumer depends on the throw to skip the offset commit and let
 * Kafka re-deliver — the previous implementation swallowed errors and
 * silently committed the offset, losing the activity forever.
 */
export class StreakRepo {
    static async applyActivity(
        args: ApplyActivityArgs,
    ): Promise<ApplyActivityResult> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            const result = await applyActivityTx(client, args);

            await client.query("COMMIT");
            return result;
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Transactional delete. Combines tombstone + row delete + event-inbox
     * mark in a single BEGIN/COMMIT — same rationale as applyActivity.
     */
    static async deleteStreakWithTombstone(
        userId: string,
        envelope: {
            event_id: string;
            event_type: "user.deleted.v1";
            event_version: 1;
            occurred_at: Date | string;
            user_id: string;
            payload: unknown;
        },
    ): Promise<void> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            await DeletedUsersModel.insertDeletedUser(userId);
            await client.query(
                `DELETE FROM lp_streaks WHERE user_id = $1`,
                [userId],
            );
            await EventIndexModel.markProcessed({
                event_id: envelope.event_id,
                event_type: envelope.event_type,
                event_version: envelope.event_version,
                user_id: envelope.user_id,
                occurred_at: envelope.occurred_at,
                payload: envelope.payload,
            });

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }
}

// ── Private helpers ─────────────────────────────────────────────────────

interface MarkProcessedArgs {
    event_id: string;
    event_type: string;
    event_version: number;
    occurred_at: Date | string;
    user_id: string;
    payload: unknown;
}

async function applyActivityTx(
    client: PoolClient,
    args: ApplyActivityArgs,
): Promise<ApplyActivityResult> {
    const { userId } = args;

    // 1. ensure row exists (within the tx)
    const upserted = await upsertStreakRow(client, userId);

    // 2. decide "today" in the user's timezone
    const tz = upserted.user_timezone || DEFAULT_TZ;
    const todayDate = todayInTz(tz, args.occurredAt ?? new Date());

    // 3. atomically update the streak. This single statement reads
    //    `last_activity_date` and writes the new state — no read-modify-
    //    write window for another tx to slip into.
    const updated = await applyDailyIncrementTx(client, userId, todayDate);

    // 4. did this call actually change anything?
    const previousStreak = upserted.current_streak;
    const dayDelta = daysBetween(upserted.last_activity_date, todayDate, tz);
    const classified = classifyDayDelta(
        Number.isFinite(dayDelta) ? dayDelta : 0,
    );
    const incremented =
        classified.kind === "next-day" || classified.kind === "missed";

    // 5. compute celebration
    const milestones = await getMilestonesTx(client);
    const celebration = incremented
        ? celebrationFromMilestones(previousStreak, updated.current_streak, milestones)
        : null;

    return {
        updated: incremented,
        currentStreak: updated.current_streak,
        longestStreak: updated.longest_streak,
        lastActivityDate: todayDate,
        celebration,
        is_active: true,
    };
}

/**
 * Same SQL as StreakModel.upsertStreakRow but takes an explicit client
 * so the caller controls the transaction. Duplicated to keep model.ts
 * dependency-free of tx plumbing.
 */
async function upsertStreakRow(
    client: PoolClient,
    userId: string,
): Promise<UserStreak> {
    const result = await client.query<UserStreak>(
        `INSERT INTO lp_streaks (user_id, current_streak, longest_streak,
                                last_activity_date, user_timezone)
         VALUES ($1, 0, 0, NULL, 'Europe/Berlin')
         ON CONFLICT (user_id) DO NOTHING
         RETURNING id, user_id, current_streak, longest_streak,
                   last_activity_date, user_timezone, created_at, updated_at`,
        [userId],
    );

    if (result.rowCount && result.rowCount > 0) {
        const row = result.rows[0];
        if (row) return row;
    }

    const existing = await client.query<UserStreak>(
        `SELECT id, user_id, current_streak, longest_streak,
                last_activity_date, user_timezone, created_at, updated_at
         FROM lp_streaks
         WHERE user_id = $1`,
        [userId],
    );

    if (!existing.rows[0]) {
        throw new Error(
            `upsertStreakRow: row missing after conflict for user ${userId}`,
        );
    }
    return existing.rows[0];
}

async function applyDailyIncrementTx(
    client: PoolClient,
    userId: string,
    todayDate: string,
): Promise<UserStreak> {
    const result = await client.query<UserStreak>(
        `UPDATE lp_streaks
         SET current_streak = CASE
                 WHEN last_activity_date = $2::date
                     THEN current_streak
                 WHEN last_activity_date = $2::date - INTERVAL '1 day'
                     THEN current_streak + 1
                 ELSE 1
             END,
             longest_streak = GREATEST(
                 longest_streak,
                 CASE
                     WHEN last_activity_date = $2::date - INTERVAL '1 day'
                         THEN current_streak + 1
                     ELSE 1
                 END
             ),
             last_activity_date = $2::date,
             updated_at = now()
         WHERE user_id = $1
         RETURNING id, user_id, current_streak, longest_streak,
                   last_activity_date, user_timezone, created_at, updated_at`,
        [userId, todayDate],
    );
    const row = result.rows[0];

    if (!result.rows[0]) {
        throw new Error(
            `applyDailyIncrement: no streak row for user ${userId}`,
        );
    }
    return result.rows[0] as UserStreak;
}

async function getMilestonesTx(client: PoolClient): Promise<StreakMilestone[]> {
    const result = await client.query<StreakMilestone>(
        `SELECT days, label, sort_order
         FROM lp_streak_milestones
         ORDER BY sort_order ASC`,
    );
    return result.rows;
}
