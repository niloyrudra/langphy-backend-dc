/**
 * SessionCompletedHandler tests. Locks the consumer contract:
 *   - skip when already processed (idempotent)
 *   - skip when user tombstoned
 *   - mark ineligible events processed (so they're not re-evaluated)
 *   - apply streak math in one tx
 *   - publish streak.updated.v1 ONLY when updated=true
 *   - mark processed at the end
 */

import {
    mockPool,
    mockClient,
    asPoolClient,
} from "../../../helpers/mock-pg";
import {
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";

const mockPgPool = mockPool();
const mockClientObj = mockClient();

jest.mock("../../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

// Mock the Kafka producer — the handler calls `producer.send` directly.
const mockProducer = {
    send: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
};

jest.mock("../../../../src/kafka/producer.js", () => ({
    producer: mockProducer,
}));

import { SessionCompletedHandler } from "../../../../src/kafka/handlers/session-completed.handler";

const baseEvent = {
    event_id: "00000000-0000-4000-8000-000000000001",
    event_type: "session.completed.v1" as const,
    event_version: 1 as const,
    occurred_at: new Date("2025-01-15T12:00:00Z"),
    user_id: "00000000-0000-4000-8000-0000000000aa",
    payload: {
        unit_id: "u-1",
        session_type: "practice" as const,
        session_key: "s-1",
        total_duration_ms: 60_000,
        attempts: 1,
        completed_at: Date.now(),
    },
};

const ctx = { topic: "session.completed.v1", partition: 0, offset: "42" };

describe("SessionCompletedHandler", () => {
    let handler: SessionCompletedHandler;

    beforeEach(() => {
        mockPgPool.query.mockReset();
        mockPgPool.connect.mockReset();
        mockClientObj.query.mockReset();
        mockClientObj.release.mockReset();
        mockPgPool.connect.mockResolvedValue(
            asPoolClient(mockClientObj),
        );
        mockProducer.send.mockReset();
        handler = new SessionCompletedHandler();
    });

    it("skips when event already processed", async () => {
        // exists() → true
        mockPgPool.query.mockResolvedValueOnce({
            rows: [{}],
            rowCount: 1,
        });

        await handler.handle(baseEvent, ctx);

        // No client queries (no BEGIN), no producer send, no second query.
        expect(mockClientObj.query).not.toHaveBeenCalled();
        expect(mockProducer.send).not.toHaveBeenCalled();
    });

    it("skips when user has been tombstoned", async () => {
        // exists() → false (not in event_inbox)
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // DeletedUsersRepo.exists() → true
        mockPgPool.query.mockResolvedValueOnce({
            rows: [{}],
            rowCount: 1,
        });

        await handler.handle(baseEvent, ctx);

        expect(mockClientObj.query).not.toHaveBeenCalled();
        expect(mockProducer.send).not.toHaveBeenCalled();
    });

    it("marks ineligible events processed and skips tx", async () => {
        // exists() → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // deleted_users → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // markProcessed → success
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 1,
        });

        const ineligible = {
            ...baseEvent,
            event_id: "00000000-0000-4000-8000-0000000000ff",
            payload: {
                ...baseEvent.payload,
                total_duration_ms: 5_000, // < 60_000
                // no score → ineligible
            },
        };

        await handler.handle(ineligible, ctx);

        expect(mockClientObj.query).not.toHaveBeenCalled();
        expect(mockProducer.send).not.toHaveBeenCalled();
        // The third query was the event_inbox INSERT.
        const sqls = mockPgPool.query.mock.calls.map(
            (c) => c[0] as string,
        );
        expect(sqls[2]).toContain("INSERT INTO event_inbox");
    });

    it("applies activity and publishes streak.updated when changed", async () => {
        // exists() → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // deleted_users → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // Begin tx:
        //   BEGIN
        mockClientObj.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        //   upsertStreakRow → existing user, streak=4, last_activity_date=yesterday
        mockClientObj.query.mockResolvedValueOnce({
            rows: [
                {
                    id: "abc",
                    user_id: baseEvent.user_id,
                    current_streak: 4,
                    longest_streak: 4,
                    last_activity_date: "2025-01-14",
                    user_timezone: "Europe/Berlin",
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ],
            rowCount: 1,
        });
        //   applyDailyIncrement → current_streak=1
        mockClientObj.query.mockResolvedValueOnce({
            rows: [
                {
                    id: "abc",
                    user_id: baseEvent.user_id,
                    current_streak: 1,
                    longest_streak: 1,
                    last_activity_date: "2025-01-15",
                    user_timezone: "Europe/Berlin",
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ],
            rowCount: 1,
        });
        //   milestones
        mockClientObj.query.mockResolvedValueOnce({
            rows: [{ days: 1, label: "streak_1", sort_order: 1 }],
            rowCount: 1,
        });
        //   COMMIT
        mockClientObj.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        // producer.send → success
        mockProducer.send.mockResolvedValueOnce(undefined as never);

        // markProcessed at end
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 1,
        });

        await handler.handle(baseEvent, ctx);

        // producer got streak.updated.v1 with the right key
        expect(mockProducer.send).toHaveBeenCalledTimes(1);
        const sendArgs = mockProducer.send.mock.calls[0]![0] as {
            topic: string;
            messages: Array<{ key: string; value: string }>;
        };
        expect(sendArgs.topic).toBe("streak.updated.v1");
        expect(sendArgs.messages[0]?.key).toBe(baseEvent.user_id);

        // The last query on the pool was the markProcessed event_inbox insert.
        const sqls = mockPgPool.query.mock.calls.map(
            (c) => c[0] as string,
        );
        const lastInsert = sqls.filter((s) =>
            s.includes("INSERT INTO event_inbox"),
        );
        expect(lastInsert.length).toBeGreaterThanOrEqual(1);
    });

    it("does NOT publish when updated=false (same-day)", async () => {
        // exists() → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // deleted_users → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // tx:
        mockClientObj.query
            // BEGIN
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            // upsert — already had a row, current_streak=4, last_activity_date=today
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: "abc",
                        user_id: baseEvent.user_id,
                        current_streak: 4,
                        longest_streak: 9,
                        last_activity_date: "2025-01-15",
                        user_timezone: "Europe/Berlin",
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
                rowCount: 1,
            })
            // applyDailyIncrement → unchanged
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: "abc",
                        user_id: baseEvent.user_id,
                        current_streak: 4,
                        longest_streak: 9,
                        last_activity_date: "2025-01-15",
                        user_timezone: "Europe/Berlin",
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
                rowCount: 1,
            })
            // milestones
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            // COMMIT
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        // markProcessed
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 1,
        });

        await handler.handle(baseEvent, ctx);

        expect(mockProducer.send).not.toHaveBeenCalled();
    });

    it("throws when applyActivity fails (no offset would be committed)", async () => {
        // exists() → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // deleted_users → false
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // tx:
        mockClientObj.query
            // BEGIN
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            // upsert fails
            .mockRejectedValueOnce(new Error("connection lost"));
        // ROLLBACK still runs
        mockClientObj.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await expect(handler.handle(baseEvent, ctx)).rejects.toThrow(
            "connection lost",
        );
        expect(mockProducer.send).not.toHaveBeenCalled();
    });
});
