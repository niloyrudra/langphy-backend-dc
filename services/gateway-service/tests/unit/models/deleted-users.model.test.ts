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
        it("inserts a deleted user with ON CONFLICT DO NOTHING", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await DeletedUsersModel.insertDeletedUser("user-123");
            assertSqlContains(mockPgPool.query, "INSERT INTO deleted_users");
            assertSqlContains(mockPgPool.query, "ON CONFLICT (user_id) DO NOTHING");
            const params = mockPgPool.query.mock.calls[0][1];
            expect(params).toEqual(["user-123"]);
        });
    });

    describe("exists", () => {
        it("returns true when the user exists in deleted_users", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{ user_id: "user-123" }], rowCount: 1 });
            await expect(DeletedUsersModel.exists("user-123")).resolves.toBe(true);
            assertSqlContains(mockPgPool.query, "SELECT 1 FROM deleted_users WHERE user_id = $1");
        });

        it("returns false when the user is not found", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(DeletedUsersModel.exists("user-456")).resolves.toBe(false);
        });
    });
});