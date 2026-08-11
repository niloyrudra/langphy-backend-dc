import { mockPool } from "../../helpers/mock-pg";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { StreakMilestonesModel } from "../../../src/models/streak-milestones.model";

describe("StreakMilestonesModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("getMilestones", () => {
        it("returns rows ordered by sort_order", async () => {
            const rows = [
                { days: 1, label: "streak_1", sort_order: 1 },
                { days: 7, label: "streak_7", sort_order: 2 },
            ];
            mockPgPool.query.mockResolvedValueOnce({
                rows,
                rowCount: 2,
            });
            const out = await StreakMilestonesModel.getMilestones();
            expect(out).toEqual(rows);
        });
    });

    describe("upsert", () => {
        it("uses ON CONFLICT (days) DO UPDATE", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            await StreakMilestonesModel.upsert(7, "streak_7", 2);
            const sql = mockPgPool.query.mock.calls[0]![0] as string;
            expect(sql).toContain("INSERT INTO lp_streak_milestones");
            expect(sql).toContain("ON CONFLICT (days) DO UPDATE");
        });
    });

    describe("delete", () => {
        it("returns true when row was deleted", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            expect(await StreakMilestonesModel.delete(7)).toBe(true);
        });

        it("returns false when no row matched", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            expect(await StreakMilestonesModel.delete(999)).toBe(false);
        });
    });
});