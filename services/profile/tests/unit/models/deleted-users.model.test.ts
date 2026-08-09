import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { DeletedUsersModel } from "../../../src/models/deleted-users.model.js";

describe("DeletedUsersModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("insertDeletedUser", () => {
        it("executes INSERT ... ON CONFLICT DO NOTHING", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await DeletedUsersModel.insertDeletedUser("u1");
            assertSqlContains(mockPgPool.query, "INSERT INTO deleted_users");
            assertSqlContains(mockPgPool.query, "user_id, deleted_at");
            assertSqlContains(mockPgPool.query, "ON CONFLICT (user_id) DO NOTHING");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["u1"]);
        });

        it("propagates DB errors", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("connection lost"));
            await expect(DeletedUsersModel.insertDeletedUser("u1")).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("exists", () => {
        it("returns true when rowCount > 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
            await expect(DeletedUsersModel.exists("u1")).resolves.toBe(true);
        });

        it("returns false when rowCount is 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(DeletedUsersModel.exists("u1")).resolves.toBe(false);
        });

        it("queries deleted_users with correct parameters", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await DeletedUsersModel.exists("u1");
            assertSqlContains(mockPgPool.query, "SELECT 1 FROM deleted_users WHERE user_id = $1");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["u1"]);
        });
    });
});
