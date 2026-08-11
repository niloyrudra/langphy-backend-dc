/**
 * Pure helpers for the streaks domain. No DB, no IO.
 *
 * Locked-down behaviour:
 *   - todayInTz respects IANA + DST
 *   - isEligibleSession enforces the quality gate
 *   - celebrationFromMilestones returns the highest milestone crossed
 */

import { describe, it, expect } from "@jest/globals";
import {
    todayInTz,
    daysBetween,
    isEligibleSession,
    celebrationFromMilestones,
    STREAK_MIN_DURATION_MS,
    STREAK_MIN_SCORE,
    classifyDayDelta,
    type Milestone,
} from "../../../src/domain/streak-math";

describe("todayInTz", () => {
    it("returns YYYY-MM-DD for Europe/Berlin", () => {
        // 2025-01-15T12:00:00Z is 13:00 local in Berlin (CET, UTC+1)
        const d = new Date("2025-01-15T12:00:00Z");
        const out = todayInTz("Europe/Berlin", d);
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(out).toBe("2025-01-15");
    });

    it("returns YYYY-MM-DD for America/New_York (UTC-5 in Jan)", () => {
        const d = new Date("2025-01-15T12:00:00Z");
        // 12:00 UTC is 07:00 local NY → still 2025-01-15
        const out = todayInTz("America/New_York", d);
        expect(out).toBe("2025-01-15");
    });

    it("handles date rollover near midnight", () => {
        // 2025-01-15T23:30:00Z is 00:30 next day in Berlin (CET, +1)
        const d = new Date("2025-01-15T23:30:00Z");
        const out = todayInTz("Europe/Berlin", d);
        expect(out).toBe("2025-01-16");
    });

    it("falls back to UTC for unknown timezones", () => {
        const d = new Date("2025-01-15T12:00:00Z");
        const out = todayInTz("Not/A/Zone", d);
        expect(out).toBe("2025-01-15");
    });
});

describe("daysBetween", () => {
    it("returns 1 for consecutive days", () => {
        expect(daysBetween("2025-01-14", "2025-01-15", "Europe/Berlin")).toBe(
            1,
        );
    });

    it("returns 0 for same day", () => {
        expect(daysBetween("2025-01-15", "2025-01-15", "Europe/Berlin")).toBe(
            0,
        );
    });

    it("returns 2 for skipped day", () => {
        expect(daysBetween("2025-01-13", "2025-01-15", "Europe/Berlin")).toBe(
            2,
        );
    });

    it("returns Infinity when prev is null (no prior activity)", () => {
        expect(
            daysBetween(null, "2025-01-15", "Europe/Berlin"),
        ).toBeGreaterThan(1_000_000);
    });
});

describe("classifyDayDelta", () => {
    it("delta=0 → same-day", () => {
        expect(classifyDayDelta(0)).toEqual({ kind: "same-day", delta: 0 });
    });
    it("delta=1 → next-day", () => {
        expect(classifyDayDelta(1)).toEqual({ kind: "next-day", delta: 1 });
    });
    it("delta=-1 → future (clock skew)", () => {
        expect(classifyDayDelta(-1)).toEqual({ kind: "future", delta: -1 });
    });
    it("delta=3 → missed", () => {
        expect(classifyDayDelta(3)).toEqual({ kind: "missed", delta: 3 });
    });
});

describe("isEligibleSession", () => {
    it("speaking always counts", () => {
        expect(
            isEligibleSession({
                unit_id: "u1",
                session_key: "s1",
                session_type: "speaking",
                total_duration_ms: 1_000,
                attempts: 1,
                completed_at: 0,
            }),
        ).toBe(true);
    });

    it("practice with >= 60s counts", () => {
        expect(
            isEligibleSession({
                unit_id: "u1",
                session_key: "s1",
                session_type: "practice",
                total_duration_ms: STREAK_MIN_DURATION_MS,
                attempts: 1,
                completed_at: 0,
            }),
        ).toBe(true);
    });

    it("practice with < 60s AND no score does not count", () => {
        expect(
            isEligibleSession({
                unit_id: "u1",
                session_key: "s1",
                session_type: "practice",
                total_duration_ms: 30_000,
                attempts: 1,
                completed_at: 0,
            }),
        ).toBe(false);
    });

    it("practice with low duration but high score counts", () => {
        expect(
            isEligibleSession({
                unit_id: "u1",
                session_key: "s1",
                session_type: "practice",
                total_duration_ms: 10_000,
                score: STREAK_MIN_SCORE,
                attempts: 1,
                completed_at: 0,
            }),
        ).toBe(true);
    });

    it("quiz below thresholds does not count", () => {
        expect(
            isEligibleSession({
                unit_id: "u1",
                session_key: "s1",
                session_type: "quiz",
                total_duration_ms: 5_000,
                score: 30,
                attempts: 1,
                completed_at: 0,
            }),
        ).toBe(false);
    });
});

describe("celebrationFromMilestones", () => {
    const milestones: Milestone[] = [
        { days: 1, label: "streak_1", sort_order: 1 },
        { days: 7, label: "streak_7", sort_order: 2 },
        { days: 30, label: "streak_30", sort_order: 3 },
    ];

    it("returns the crossed milestone when going from <N to >=N", () => {
        expect(celebrationFromMilestones(0, 1, milestones)).toBe("streak_1");
        expect(celebrationFromMilestones(6, 7, milestones)).toBe("streak_7");
        expect(celebrationFromMilestones(0, 30, milestones)).toBe("streak_30");
    });

    it("returns null when no milestone is crossed", () => {
        expect(celebrationFromMilestones(7, 8, milestones)).toBeNull();
        expect(celebrationFromMilestones(30, 45, milestones)).toBeNull();
    });

    it("returns null on same-day activity (no crossing)", () => {
        expect(celebrationFromMilestones(5, 5, milestones)).toBeNull();
    });
});