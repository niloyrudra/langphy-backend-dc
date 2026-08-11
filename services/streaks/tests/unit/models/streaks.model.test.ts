/**
 * StreakModel tests. Asserts SQL shape and contract; no live DB.
 */

import { mockPool, assertSqlContains } from "../../helpers/mock-pg";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

// Import AFTER the mock so the model picks up the mocked pool.
import { StreakModel } from "../../../src/models/streaks.model";

describe("StreakModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("findByUserId", () => {
        it("returns the row when found", async () => {
            const row = {
                id: "abc",
                user_id: "u1",
                current_streak: 3,
                longest_streak: 7,
                last_activity_date: "2025-01-15",
                user_timezone: "Europe/Berlin",
                created_at: new Date(),
                updated_at: new Date(),
            };
            mockPgPool.query.mockResolvedValueOnce({
                rows: [row],
                rowCount: 1,
            });

            const s = await StreakModel.findByUserId("u1");
            expect(s).toEqual(row);
            assertSqlContains(mockPgPool.query, "SELECT");
            assertSqlContains(mockPgPool.query, "FROM lp_streaks");
            assertSqlContains(mockPgPool.query, "WHERE user_id = $1");
            expect(mockPgPool.query.mock.calls[0]![1]).toEqual(["u1"]);
        });

        it("returns null when not found", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            expect(await StreakModel.findByUserId("missing")).toBeNull();
        });

        it("does NOT use SELECT *", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            await StreakModel.findByUserId("u1");
            const sql = mockPgPool.query.mock.calls[0]![0] as string;
            expect(sql).not.toMatch(/SELECT\s+\*/i);
        });
    });

    describe("upsertStreakRow", () => {
        it("uses ON CONFLICT (user_id) DO NOTHING", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "abc",
                        user_id: "u1",
                        current_streak: 0,
                        longest_streak: 0,
                        last_activity_date: null,
                        user_timezone: "Europe/Berlin",
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
                rowCount: 1,
            });

            await StreakModel.upsertStreakRow("u1");
            assertSqlContains(
                mockPgPool.query,
                "ON CONFLICT (user_id) DO NOTHING",
            );
        });

        it("falls back to a SELECT when the INSERT was a conflict", async () => {
            // 1st query: INSERT, did nothing (rowCount=0)
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            // 2nd query: SELECT existing row
            mockPgPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "abc",
                        user_id: "u1",
                        current_streak: 4,
                        longest_streak: 9,
                        last_activity_date: "2025-01-15",
                        user_timezone: "Europe/Berlin",
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
                rowCount: 1,
            });

            const row = await StreakModel.upsertStreakRow("u1");
            expect(row.current_streak).toBe(4);
            assertSqlContains(mockPgPool.query, "SELECT");
        });
    });

    describe("applyDailyIncrement", () => {
        it("uses a CASE on last_activity_date relative to today", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        id: "abc",
                        user_id: "u1",
                        current_streak: 8,
                        longest_streak: 8,
                        last_activity_date: "2025-01-16",
                        user_timezone: "Europe/Berlin",
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
                rowCount: 1,
            });

            await StreakModel.applyDailyIncrement("u1", "2025-01-16");
            const sql = mockPgPool.query.mock.calls[0]![0] as string;
            expect(sql).toMatch(/UPDATE\s+lp_streaks/i);
            expect(sql).toContain("last_activity_date = $2::date");
            expect(sql).toContain("RETURNING");
        });

        it("throws when no row matches", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            await expect(
                StreakModel.applyDailyIncrement("ghost", "2025-01-16"),
            ).rejects.toThrow(/no streak row/);
        });
    });

    describe("setUserTimezone", () => {
        it("runs an UPDATE with the new timezone", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            await StreakModel.setUserTimezone("u1", "Asia/Tokyo");
            assertSqlContains(mockPgPool.query, "UPDATE lp_streaks");
            assertSqlContains(mockPgPool.query, "user_timezone = $2");
            expect(mockPgPool.query.mock.calls[0]![1]).toEqual([
                "u1",
                "Asia/Tokyo",
            ]);
        });
    });

    describe("deleteByUserId", () => {
        it("returns true when a row was deleted", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            expect(await StreakModel.deleteByUserId("u1")).toBe(true);
        });

        it("returns false when no row was deleted", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            expect(await StreakModel.deleteByUserId("ghost")).toBe(false);
        });
    });

    describe("getMilestones", () => {
        it("returns rows ordered by sort_order", async () => {
            const rows = [
                { days: 1, label: "streak_1", sort_order: 1 },
                { days: 7, label: "streak_7", sort_order: 2 },
                { days: 30, label: "streak_30", sort_order: 3 },
            ];
            mockPgPool.query.mockResolvedValueOnce({
                rows,
                rowCount: 3,
            });
            const out = await StreakModel.getMilestones();
            expect(out).toEqual(rows);
            assertSqlContains(
                mockPgPool.query,
                "ORDER BY sort_order ASC",
            );
        });
    });
});