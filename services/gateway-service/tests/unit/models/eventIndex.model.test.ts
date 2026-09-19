import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { EventInboxModel } from "../../../src/models/eventIndex.model.js";

describe("EventInboxModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    const baseEvent = {
        event_id: "evt-1",
        event_type: "session.completed.v1",
        event_version: 1,
        user_id: "u1",
        occurred_at: new Date("2025-01-01T00:00:00Z"),
        payload: { unit_id: "unit-1", session_type: "practice" },
    };

    describe("hasProcessed", () => {
        it("returns true when the event is already in the inbox", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{ event_id: "evt-1" }], rowCount: 1 });
            await expect(EventInboxModel.hasProcessed("evt-1")).resolves.toBe(true);
            assertSqlContains(mockPgPool.query, "SELECT 1 FROM lp_event_inbox WHERE event_id = $1");
        });

        it("returns false when the event is not found", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(EventInboxModel.hasProcessed("evt-x")).resolves.toBe(false);
        });

        it("returns false on DB error (fail-open because callers treat it as 'not yet processed')", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("connection lost"));
            await expect(EventInboxModel.hasProcessed("evt-1")).resolves.toBe(false);
        });
    });

    describe("markProcessed", () => {
        it("inserts the event into lp_event_inbox with all fields", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await EventInboxModel.markProcessed(baseEvent);
            assertSqlContains(mockPgPool.query, "INSERT INTO lp_event_inbox");
            assertSqlContains(mockPgPool.query, "event_id, event_type, event_version, user_id, occurred_at, payload");
            const params = mockPgPool.query.mock.calls[0][1];
            expect(params).toEqual([
                baseEvent.event_id,
                baseEvent.event_type,
                baseEvent.event_version,
                baseEvent.user_id,
                baseEvent.occurred_at,
                baseEvent.payload,
            ]);
        });

        it("swallows DB errors (logs but does not throw)", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("disk full"));
            await expect(EventInboxModel.markProcessed(baseEvent)).resolves.toBeUndefined();
        });

        it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await EventInboxModel.markProcessed(baseEvent);
            assertSqlContains(mockPgPool.query, "ON CONFLICT DO NOTHING");
        });
    });
});