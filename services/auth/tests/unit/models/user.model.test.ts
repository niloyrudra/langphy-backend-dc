import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * We mock pgPool at the module boundary so the model under test sees a
 * fake pool. This isolates the test from a real Postgres.
 *
 * Tests assert SQL shape and parameter shape — the contract between the
 * model and the database — without actually executing queries.
 */

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

// Import AFTER the mock so the model picks up the mocked pool.
import { UserModel } from "../../../src/models/user.model.js";
import { BadRequestError } from "../../../src/errors/bad-request-errors.js";

describe("UserModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("findByEmail", () => {
        it("returns the user row when found", async () => {
            const row = {
                id: "u1",
                email: "a@b.com",
                password: "hashed",
                provider: "email",
                created_at: new Date(),
                updated_at: new Date(),
            };
            mockPgPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

            const u = await UserModel.findByEmail("a@b.com");

            expect(u).toEqual(row);
            assertSqlContains(mockPgPool.query, "SELECT id, email, password");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["a@b.com"]);
        });

        it("returns null when not found", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            const u = await UserModel.findByEmail("nobody@nowhere.com");
            expect(u).toBeNull();
        });

        it("does NOT use SELECT * (explicit columns only)", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await UserModel.findByEmail("x@y.com");
            const sql = mockPgPool.query.mock.calls[0][0] as string;
            expect(sql).not.toMatch(/SELECT\s+\*/i);
        });
    });

    describe("create", () => {
        it("throws BadRequestError on unique violation (code 23505)", async () => {
            const err: any = new Error("duplicate");
            err.code = "23505";
            mockPgPool.query.mockRejectedValueOnce(err);

            await expect(UserModel.create("a@b.com", "pw", "email")).rejects.toBeInstanceOf(
                BadRequestError
            );
        });

        it("bubbles other DB errors", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("connection lost"));
            await expect(UserModel.create("a@b.com", "pw", "email")).rejects.toThrow(
                "connection lost"
            );
        });

        it("returns the inserted row on success", async () => {
            const inserted = {
                id: "u2",
                email: "a@b.com",
                password: "hashed",
                provider: "email",
                created_at: new Date(),
                updated_at: new Date(),
            };
            mockPgPool.query.mockResolvedValueOnce({ rows: [inserted], rowCount: 1 });
            const u = await UserModel.create("a@b.com", "pw", "email");
            expect(u).toEqual(inserted);
            assertSqlContains(mockPgPool.query, "INSERT INTO lp_users");
        });
    });

    describe("resetPasswordByEmail / resetPasswordByUserId", () => {
        it("throws when no row matches", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(UserModel.resetPasswordByEmail("nobody@x.com", "newpw")).rejects.toBeInstanceOf(
                BadRequestError
            );
        });

        it("returns the row on success", async () => {
            mockPgPool.query.mockResolvedValueOnce({
                rows: [{ id: "u1", email: "a@b.com", provider: "email", created_at: new Date() }],
                rowCount: 1,
            });
            const u = await UserModel.resetPasswordByUserId("u1", "newpw");
            expect(u.id).toBe("u1");
        });
    });

    describe("delete", () => {
        it("throws when no row matches", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(UserModel.delete("missing")).rejects.toBeInstanceOf(BadRequestError);
        });
    });
});