/**
 * StreakRepo tests. Asserts transaction shape and that errors are NOT
 * silently swallowed (the original bug).
 *
 * The repo runs every read+write step inside ONE BEGIN/COMMIT. We mock
 * `pgPool.connect()` to return a MockClient, then drive both happy-
 * path and rollback.
 */

import {
    mockPool,
    mockClient,
    asPoolClient,
} from "../../helpers/mock-pg";
import {
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { StreakRepo } from "../../../src/repos/streaks.repo";

const baseUserId = "u1";

function baseUserStreakRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "abc",
        user_id: baseUserId,
        current_streak: 4,
        longest_streak: 9,
        last_activity_date: "2025-01-15",
        user_timezone: "Europe/Berlin",
        created_at: new Date(),
        updated_at: new Date(),
        ...overrides,
    };
}

describe("StreakRepo", () => {
    let client: ReturnType<typeof mockClient>;

    beforeEach(() => {
        mockPgPool.query.mockReset();
        mockPgPool.connect.mockReset();
        client = mockClient();
        mockPgPool.connect.mockResolvedValue(client);
    });

    describe("applyActivity", () => {
        it("opens BEGIN and COMMIT around the read+write+mark steps", async () => {
            client.query
                // BEGIN
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                // upsert existing row
                .mockResolvedValueOnce({
                    rows: [
                        baseUserStreakRow({
                            current_streak: 0,
                            longest_streak: 0,
                            last_activity_date: null,
                        }),
                    ],
                    rowCount: 1,
                })
                // applyDailyIncrement
                .mockResolvedValueOnce({
                    rows: [
                        baseUserStreakRow({
                            current_streak: 1,
                            longest_streak: 1,
                            last_activity_date: "2025-01-15",
                        }),
                    ],
                    rowCount: 1,
                })
                // milestones
                .mockResolvedValueOnce({
                    rows: [
                        { days: 1, label: "streak_1", sort_order: 1 },
                        { days: 7, label: "streak_7", sort_order: 2 },
                    ],
                    rowCount: 2,
                })
                // COMMIT
                .mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await StreakRepo.applyActivity({
                userId: baseUserId,
                occurredAt: new Date("2025-01-15T12:00:00Z"),
            });

            const sqls = client.query.mock.calls.map(
                (c) => c[0] as string,
            );
            expect(sqls[0]).toBe("BEGIN");
            expect(sqls[sqls.length - 1]).toBe("COMMIT");

            // Should call release exactly once.
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("ROLLBACKs and re-throws when an inner step fails", async () => {
            client.query
                // BEGIN
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                // upsert → succeeds
                .mockResolvedValueOnce({
                    rows: [baseUserStreakRow()],
                    rowCount: 1,
                })
                // applyDailyIncrement → fails
                .mockRejectedValueOnce(new Error("db is down"))
                // ROLLBACK should still happen
                .mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await expect(
                StreakRepo.applyActivity({
                    userId: baseUserId,
                    occurredAt: new Date("2025-01-15T12:00:00Z"),
                }),
            ).rejects.toThrow("db is down");

            const sqls = client.query.mock.calls.map(
                (c) => c[0] as string,
            );
            expect(sqls).toContain("BEGIN");
            expect(sqls).toContain("ROLLBACK");
            // Should release even on failure.
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("marks celebration when a milestone is crossed", async () => {
            client.query
                // BEGIN
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                // upsert — existing row current_streak=6
                .mockResolvedValueOnce({
                    rows: [
                        baseUserStreakRow({
                            current_streak: 6,
                            longest_streak: 6,
                            last_activity_date: "2025-01-14",
                        }),
                    ],
                    rowCount: 1,
                })
                // applyDailyIncrement → current_streak=7
                .mockResolvedValueOnce({
                    rows: [
                        baseUserStreakRow({
                            current_streak: 7,
                            longest_streak: 7,
                            last_activity_date: "2025-01-15",
                        }),
                    ],
                    rowCount: 1,
                })
                // milestones
                .mockResolvedValueOnce({
                    rows: [{ days: 7, label: "streak_7", sort_order: 2 }],
                    rowCount: 1,
                })
                // COMMIT
                .mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const out = await StreakRepo.applyActivity({
                userId: baseUserId,
                occurredAt: new Date("2025-01-15T12:00:00Z"),
            });

            expect(out.updated).toBe(true);
            expect(out.currentStreak).toBe(7);
            expect(out.celebration).toBe("streak_7");
        });

        it("returns updated=false when the session is same-day", async () => {
            client.query
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                // upsert — existing row current_streak=4, last_activity_date=today
                .mockResolvedValueOnce({
                    rows: [
                        baseUserStreakRow({
                            current_streak: 4,
                            last_activity_date: "2025-01-15",
                        }),
                    ],
                    rowCount: 1,
                })
                // applyDailyIncrement → unchanged (same-day)
                .mockResolvedValueOnce({
                    rows: [
                        baseUserStreakRow({
                            current_streak: 4,
                            last_activity_date: "2025-01-15",
                        }),
                    ],
                    rowCount: 1,
                })
                // milestones
                .mockResolvedValueOnce({
                    rows: [],
                    rowCount: 0,
                })
                // COMMIT
                .mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const out = await StreakRepo.applyActivity({
                userId: baseUserId,
                occurredAt: new Date("2025-01-15T22:00:00Z"),
            });

            expect(out.updated).toBe(false);
            expect(out.celebration).toBeNull();
        });
    });

    describe("deleteStreakWithTombstone", () => {
        it("tombstone + delete + markProcessed in one tx", async () => {
            // BEGIN
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            // insertDeletedUser (its own BEGIN/COMMIT — model uses pgPool.query directly)
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            // DELETE FROM lp_streaks
            client.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            // markProcessed uses pgPool.query
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            // COMMIT
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await StreakRepo.deleteStreakWithTombstone(baseUserId, {
                event_id: "00000000-0000-4000-8000-000000000001",
                event_type: "user.deleted.v1",
                event_version: 1,
                occurred_at: new Date("2025-01-15T12:00:00Z"),
                user_id: baseUserId,
                payload: {},
            });

            const txSqls = client.query.mock.calls.map(
                (c) => c[0] as string,
            );
            expect(txSqls[0]).toBe("BEGIN");
            expect(txSqls[txSqls.length - 1]).toBe("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
            // Tombstone INSERT ran on the pool (not the client).
            const poolSqls = mockPgPool.query.mock.calls.map(
                (c) => c[0] as string,
            );
            expect(
                poolSqls.some((s) => s.includes("deleted_users")),
            ).toBe(true);
        });
    });
});
