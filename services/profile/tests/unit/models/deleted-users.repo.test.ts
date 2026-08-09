import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { DeletedUsersRepo } from "../../../src/repos/deleted-users.repo.js";

describe("DeletedUsersRepo", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("insert", () => {
        it("inserts a tombstone row", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await DeletedUsersRepo.insert("u1");
            assertSqlContains(mockPgPool.query, "INSERT INTO deleted_users");
        });

        it("propagates DB errors", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("boom"));
            await expect(DeletedUsersRepo.insert("u1")).rejects.toThrow("boom");
        });
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
});
