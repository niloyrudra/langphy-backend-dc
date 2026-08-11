/**
 * EventIndexModel tests. Locks the contract:
 *   - exists() returns boolean
 *   - markProcessed() THROWS on DB error (does NOT swallow)
 *   - markProcessed() rejects invalid occurred_at
 */

import { mockPool } from "../../helpers/mock-pg";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { EventIndexModel } from "../../../src/models/eventIndex.model";

describe("EventIndexModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("exists", () => {
        it("returns true when rowCount > 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [{}],
                rowCount: 1,
            });
            expect(await EventIndexModel.exists("e1")).toBe(true);
        });

        it("returns false when rowCount === 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            expect(await EventIndexModel.exists("missing")).toBe(false);
        });

        it("queries event_inbox by event_id", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            await EventIndexModel.exists("e1");
            const sql = mockPgPool.query.mock.calls[0]![0] as string;
            expect(sql).toContain("event_inbox");
            expect(sql).toContain("event_id = $1");
        });
    });

    describe("markProcessed", () => {
        const baseInput = {
            event_id: "00000000-0000-4000-8000-000000000001",
            event_type: "session.completed.v1",
            event_version: 1,
            user_id: "00000000-0000-4000-8000-0000000000aa",
            occurred_at: new Date("2025-01-15T12:00:00Z"),
            payload: { foo: "bar" },
        };

        it("inserts into event_inbox with all fields", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });
            await EventIndexModel.markProcessed(baseInput);
            const sql = mockPgPool.query.mock.calls[0]![0] as string;
            expect(sql).toContain("INSERT INTO event_inbox");
            expect(sql).toContain("event_id");
            expect(sql).toContain("payload");
        });

        it("THROWS on DB error (does NOT swallow)", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("db is down"));
            await expect(
                EventIndexModel.markProcessed(baseInput),
            ).rejects.toThrow("db is down");
        });

        it("throws on invalid occurred_at", async () => {
            await expect(
                EventIndexModel.markProcessed({
                    ...baseInput,
                    occurred_at: "not a date",
                }),
            ).rejects.toThrow(/invalid occurred_at/);
        });
    });
});