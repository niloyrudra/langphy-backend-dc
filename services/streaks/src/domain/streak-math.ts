/**
 * Pure date / session helpers for the streaks service. No DB, no IO.
 *
 * `todayInTz` and `daysBetween` use Intl.DateTimeFormat for timezone
 * math, which is the only correct way to handle DST in Node — manual
 * hour arithmetic breaks twice a year.
 *
 * `isEligibleSession` encodes the product's quality gate: only sessions
 * that demonstrate real engagement bump the streak. Tunable in one
 * place when PMs want to relax the rule.
 */

import type { SessionCompletedEvent } from "@langphy/shared";

// ── Quality gate ────────────────────────────────────────────────────────

/** Minimum session duration in milliseconds that counts toward the streak. */
export const STREAK_MIN_DURATION_MS = 60_000;

/** Minimum score (0–100) for a session to count without the duration gate. */
export const STREAK_MIN_SCORE = 70;

/**
 * Decide whether a session.completed.v1 event should bump the streak.
 *
 * Rules (decided with PM):
 *   - `speaking` always counts on completion (an actual ASR result was
 *     produced; that's enough effort).
 *   - everything else needs `total_duration_ms >= 60_000` OR
 *     `score >= 70`.
 */
export function isEligibleSession(
    payload: SessionCompletedEvent["payload"],
): boolean {
    if (payload.session_type === "speaking") {
        return true;
    }
    if (
        typeof payload.total_duration_ms === "number" &&
        payload.total_duration_ms >= STREAK_MIN_DURATION_MS
    ) {
        return true;
    }
    if (
        typeof payload.score === "number" &&
        payload.score >= STREAK_MIN_SCORE
    ) {
        return true;
    }
    return false;
}

// ── Timezone-aware day math ─────────────────────────────────────────────

/**
 * Today's calendar date in the given IANA timezone, formatted as
 * `YYYY-MM-DD`. Falls back to UTC for an unknown timezone string —
 * callers should validate `user_timezone` upstream if they care.
 */
export function todayInTz(tz: string, now: Date = new Date()): string {
    try {
        const fmt = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        return fmt.format(now); // en-CA emits YYYY-MM-DD
    } catch {
        return new Date(now.getTime()).toISOString().slice(0, 10);
    }
}

/**
 * Number of whole calendar days between two `YYYY-MM-DD` strings,
 * interpreted in the user's timezone. Positive = `b` is later than `a`.
 *
 * Returns 0 if `prevDate === today` (same calendar day). Returns
 * `Infinity` if `prevDate` is null (no prior activity).
 *
 * We compute the delta by re-formatting "now" and "now+offset" through
 * Intl.DateTimeFormat so DST transitions don't drift the count.
 */
export function daysBetween(
    prevDate: string | null,
    today: string,
    tz: string,
): number {
    if (!prevDate) return Number.POSITIVE_INFINITY;
    if (prevDate === today) return 0;

    // Walk day-by-day from prevDate toward today, counting how many
    // calendar boundaries are crossed. We re-use Intl to avoid manual
    // date math.
    let cursor = new Date(`${prevDate}T12:00:00Z`); // noon avoids DST edge cases
    let count = 0;
    // Safety cap: 10 years. A bug elsewhere can't loop forever.
    for (let i = 0; i < 3650; i++) {
        cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
        if (todayInTz(tz, cursor) === today) {
            count++;
            return count;
        }
        count++;
        if (count > 3650) break;
    }
    return count;
}

/**
 * Classify a session's relation to the user's last activity date so
 * the consumer can decide whether to increment, hold, or reset the
 * streak.
 */
export type DayDelta =
    | { kind: "same-day"; delta: 0 }
    | { kind: "next-day"; delta: 1 }
    | { kind: "future"; delta: number } // clock-skew anomaly; treat as same-day
    | { kind: "missed"; delta: number }; // > 1 days; reset to 1

export function classifyDayDelta(delta: number): DayDelta {
    if (delta === 0) return { kind: "same-day", delta };
    if (delta === 1) return { kind: "next-day", delta };
    if (delta < 0) return { kind: "future", delta };
    return { kind: "missed", delta };
}

// ── Celebration matching ────────────────────────────────────────────────

export interface Milestone {
    days: number;
    label: string;
    sort_order: number;
}

/**
 * Return the celebration label for `currentStreak` if it crosses a
 * milestone, else null. "Crosses" means the previous streak value was
 * < milestone AND the new value is >= milestone.
 *
 * Pass `milestones` already sorted by `days` ascending.
 */
export function celebrationFromMilestones(
    previousStreak: number,
    currentStreak: number,
    milestones: readonly Milestone[],
): string | null {
    let hit: string | null = null;
    for (const m of milestones) {
        if (previousStreak < m.days && currentStreak >= m.days) {
            // If multiple milestones are crossed in one event, return
            // the highest.
            hit = m.label;
        }
    }
    return hit;
}
