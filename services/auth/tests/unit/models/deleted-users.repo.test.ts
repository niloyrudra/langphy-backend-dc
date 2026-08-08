import { mockPool, mockClient, asPoolClient } from "../../helpers/mock-pg.js";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockPgPool = mockPool();
const client = mockClient();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { DeletedUsersRepo } from "../../../src/repos/deleted-users.repo.js";
import { OutboxRepo } from "../../../src/repos/outbox.repo.js";

describe("DeletedUsersRepo", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
        client.query.mockReset();
        mockPgPool.connect.mockReset();
        mockPgPool.connect.mockResolvedValue(asPoolClient(client));
    });

    describe("exists", () => {
        it("returns true when rowCount > 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
            await expect(DeletedUsersRepo.exists("u1")).resolves.toBe(true);
        });

        it("returns false when rowCount === 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(DeletedUsersRepo.exists("u1")).resolves.toBe(false);
        });
    });

    describe("softDeleteWithOutbox", () => {
        const envelope = {
            event_id: "00000000-0000-4000-8000-000000000001",
            event_type: "user.deleted.v1" as const,
            event_version: 1 as const,
            occurred_at: new Date("2025-01-01T00:00:00Z"),
            user_id: "00000000-0000-4000-8000-0000000000aa",
            payload: { reason: "user_requested", deleted_by: "user" as const },
        };

        it("opens a transaction, deletes, tombstones, enqueues, commits", async () => {
            // 1st query: BEGIN (success)
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            // 2nd: DELETE FROM lp_users → 1 row affected
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            // 3rd: INSERT INTO deleted_users
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            // 4th: INSERT INTO outbox_events
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            // 5th: COMMIT
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await DeletedUsersRepo.softDeleteWithOutbox(envelope.user_id, envelope);

            const calls = client.query.mock.calls.map((c) => c[0]);
            expect(calls[0]).toMatch(/BEGIN/i);
            expect(calls[1]).toMatch(/DELETE FROM lp_users/i);
            expect(calls[2]).toMatch(/INSERT INTO deleted_users/i);
            expect(calls[3]).toMatch(/INSERT INTO outbox_events/i);
            expect(calls[4]).toMatch(/COMMIT/i);
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("rolls back and throws when the user does not exist", async () => {
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // BEGIN
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE → 0 rows
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

            await expect(
                DeletedUsersRepo.softDeleteWithOutbox(envelope.user_id, envelope)
            ).rejects.toThrow(/not found/i);

            const calls = client.query.mock.calls.map((c) => c[0]);
            expect(calls).toContain("ROLLBACK");
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("releases the client even on unexpected DB error", async () => {
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // BEGIN
            client.query.mockRejectedValueOnce(new Error("boom")); // DELETE throws
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

            await expect(
                DeletedUsersRepo.softDeleteWithOutbox(envelope.user_id, envelope)
            ).rejects.toThrow("boom");

            expect(client.release).toHaveBeenCalledTimes(1);
        });
    });
});