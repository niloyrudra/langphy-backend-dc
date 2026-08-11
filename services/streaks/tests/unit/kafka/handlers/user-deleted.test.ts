/**
 * UserDeletedHandler tests. Locks the contract:
 *   - skip when event already processed
 *   - delete streak + tombstone + mark processed in one tx
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

import { UserDeletedHandler } from "../../../../src/kafka/handlers/user-deleted.handler";

const envelope = {
    event_id: "00000000-0000-4000-8000-000000000001",
    event_type: "user.deleted.v1" as const,
    event_version: 1 as const,
    occurred_at: new Date("2025-01-15T12:00:00Z"),
    user_id: "00000000-0000-4000-8000-0000000000aa",
    payload: { reason: "user_requested", deleted_by: "user" as const },
};

const ctx = { topic: "user.deleted.v1", partition: 0, offset: "42" };

describe("UserDeletedHandler", () => {
    let handler: UserDeletedHandler;

    beforeEach(() => {
        mockPgPool.query.mockReset();
        mockPgPool.connect.mockReset();
        mockClientObj.query.mockReset();
        mockClientObj.release.mockReset();
        mockPgPool.connect.mockResolvedValue(
            asPoolClient(mockClientObj),
        );
        handler = new UserDeletedHandler();
    });

    it("skips when event already processed", async () => {
        mockPgPool.query.mockResolvedValueOnce({
            rows: [{}],
            rowCount: 1,
        });

        await handler.handle(envelope, ctx);

        expect(mockClientObj.query).not.toHaveBeenCalled();
    });

    it("tombstones + deletes streak + marks processed in one tx", async () => {
        // exists() → false (not processed yet)
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        // tx:
        mockClientObj.query
            // BEGIN
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            // DELETE FROM lp_streaks
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            // COMMIT
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        // DeletedUsersModel.insertDeletedUser uses pgPool.query
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 1,
        });
        // markProcessed uses pgPool.query
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 1,
        });

        await handler.handle(envelope, ctx);

        const sqls = mockClientObj.query.mock.calls.map(
            (c) => c[0] as string,
        );
        expect(sqls[0]).toBe("BEGIN");
        expect(sqls[sqls.length - 1]).toBe("COMMIT");

        const poolSqls = mockPgPool.query.mock.calls.map(
            (c) => c[0] as string,
        );
        expect(
            poolSqls.some((s) => s.includes("INSERT INTO deleted_users")),
        ).toBe(true);
        expect(
            poolSqls.some((s) => s.includes("INSERT INTO event_inbox")),
        ).toBe(true);
    });

    it("ROLLBACKs and throws if the DELETE fails", async () => {
        mockPgPool.query.mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        });
        mockClientObj.query
            // BEGIN
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            // DELETE throws
            .mockRejectedValueOnce(new Error("db gone"));
        // ROLLBACK should still run
        mockClientObj.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await expect(handler.handle(envelope, ctx)).rejects.toThrow(
            "db gone",
        );

        const sqls = mockClientObj.query.mock.calls.map(
            (c) => c[0] as string,
        );
        expect(sqls).toContain("ROLLBACK");
        expect(mockClientObj.release).toHaveBeenCalledTimes(1);
    });
});
