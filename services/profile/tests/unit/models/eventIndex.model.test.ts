import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { EventIndexModel } from "../../../src/models/eventIndex.model.js";

describe("EventIndexModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    const baseInput = {
        event_id: "evt-1",
        event_type: "user.registered.v1",
        event_version: 1,
        user_id: "u1",
        occurred_at: "2025-01-01T00:00:00Z",
        payload: { email: "a@b.com" },
    };

    describe("exists", () => {
        it("returns true when the event is already in the inbox", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{ event_id: "evt-1" }], rowCount: 1 });
            await expect(EventIndexModel.exists("evt-1")).resolves.toBe(true);
            assertSqlContains(mockPgPool.query, "SELECT event_id FROM event_inbox WHERE event_id = $1");
        });

        it("returns false when the event is not found", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(EventIndexModel.exists("evt-x")).resolves.toBe(false);
        });

        it("returns false on DB error (fail-open because callers treat it as 'not yet processed')", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("connection lost"));
            await expect(EventIndexModel.exists("evt-1")).resolves.toBe(false);
        });
    });

    describe("markProcessed", () => {
        it("inserts the event into event_inbox with all fields", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await EventIndexModel.markProcessed(baseInput);
            assertSqlContains(mockPgPool.query, "INSERT INTO event_inbox");
            assertSqlContains(mockPgPool.query, "event_id, event_type, event_version, user_id, occurred_at, payload");
            const params = mockPgPool.query.mock.calls[0][1];
            expect(params).toEqual([
                baseInput.event_id,
                baseInput.event_type,
                baseInput.event_version,
                baseInput.user_id,
                baseInput.occurred_at,
                JSON.stringify(baseInput.payload),
            ]);
        });

        it("swallows DB errors (logs but does not throw)", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("disk full"));
            await expect(EventIndexModel.markProcessed(baseInput)).resolves.toBeUndefined();
        });
    });
});
