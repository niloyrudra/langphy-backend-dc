/**
 * DeletedUsersRepo tests. Thin pass-through over DeletedUsersModel,
 * but locks the contract so future refactors can't silently break the
 * tombstone check inside the consumer.
 */

import { mockPool } from "../../helpers/mock-pg";
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

import { DeletedUsersRepo } from "../../../src/repos/deleted-users.repo";

describe("DeletedUsersRepo", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("insert", () => {
        it("INSERTs into deleted_users with ON CONFLICT DO NOTHING", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            });

            await DeletedUsersRepo.insert("u1");

            const sql = mockPgPool.query.mock.calls[0]![0] as string;
            expect(sql).toContain("INSERT INTO deleted_users");
            expect(sql).toContain("ON CONFLICT");
        });
    });

    describe("exists", () => {
        it("returns true when rowCount > 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [{}],
                rowCount: 1,
            });
            expect(await DeletedUsersRepo.exists("u1")).toBe(true);
        });

        it("returns false when rowCount === 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            });
            expect(await DeletedUsersRepo.exists("ghost")).toBe(false);
        });
    });
});
