import { pgPool } from "../db/index.js";

export interface UserStreak {
    id: string;
    user_id: string;
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
    user_timezone: string;
    created_at: Date;
    updated_at: Date;
}

export interface StreakMilestone {
    days: number;
    label: string;
    sort_order: number;
}

/**
 * Data-access layer for lp_streaks and lp_streak_milestones. Pure SQL —
 * no business logic (that lives in domain/streak-math.ts and
 * repos/streaks.repo.ts). Errors bubble to the caller; no silent
 * fallbacks.
 */
export class StreakModel {
    // ── Read paths ────────────────────────────────────────────────────

    static async findByUserId(userId: string): Promise<UserStreak | null> {
        const result = await pgPool.query<UserStreak>(
            `SELECT id, user_id, current_streak, longest_streak,
                    last_activity_date, user_timezone, created_at, updated_at
             FROM lp_streaks
             WHERE user_id = $1`,
            [userId],
        );
        const row = result.rows[0];
        return row ?? null;
    }

    // ── Write paths ───────────────────────────────────────────────────

    /**
     * Idempotent insert. Uses ON CONFLICT DO NOTHING + RETURNING so
     * the row exists after the call regardless of who created it
     * first.
     */
    static async upsertStreakRow(userId: string): Promise<UserStreak> {
        const result = await pgPool.query<UserStreak>(
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

        // Race: another worker inserted first. Fetch the existing row.
        const existing = await StreakModel.findByUserId(userId);
        if (!existing) {
            // Should be unreachable.
            throw new Error(
                `upsertStreakRow: row missing after conflict for user ${userId}`,
            );
        }
        return existing;
    }

    /**
     * Persist a per-user timezone. Idempotent; the value is overwritten
     * with whatever the latest event claims.
     */
    static async setUserTimezone(userId: string, tz: string): Promise<void> {
        await pgPool.query(
            `UPDATE lp_streaks
             SET user_timezone = $2,
                 updated_at = now()
             WHERE user_id = $1`,
            [userId, tz],
        );
    }

    /**
     * Atomically update the streak given the user's local "today". The
     * DB computes delta against `last_activity_date`:
     *
     *   - last_activity_date = today → no-op (same day)
     *   - last_activity_date = today - 1 → current_streak + 1
     *   - last_activity_date < today - 1 → reset to 1
     *
     * Returns the row after the UPDATE so callers can read the
     * authoritative current/longest counters and `user_timezone`.
     */
    static async applyDailyIncrement(
        userId: string,
        todayDate: string,
    ): Promise<UserStreak> {
        const result = await pgPool.query<UserStreak>(
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

        if (!result.rows[0]) {
            throw new Error(
                `applyDailyIncrement: no streak row for user ${userId}`,
            );
        }
        return result.rows[0] as UserStreak;
    }

    static async deleteByUserId(userId: string): Promise<boolean> {
        const result = await pgPool.query(
            `DELETE FROM lp_streaks WHERE user_id = $1`,
            [userId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    // ── Milestones ────────────────────────────────────────────────────

    static async getMilestones(): Promise<StreakMilestone[]> {
        const result = await pgPool.query<StreakMilestone>(
            `SELECT days, label, sort_order
             FROM lp_streak_milestones
             ORDER BY sort_order ASC`,
        );
        return result.rows;
    }
}
