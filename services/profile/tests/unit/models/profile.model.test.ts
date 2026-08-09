import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

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

import { ProfileModel } from "../../../src/models/profile.model.js";
import { BadRequestError } from "../../../src/errors/bad-request-errors.js";
import type { UserData, UserProfile } from "../../../src/models/profile.model.js";

describe("ProfileModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    const baseUserData: UserData = {
        user_id: "u1",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        profile_image: "http://img/pic.png",
    };

    const baseProfileRow: UserProfile = {
        id: "p1",
        user_id: "u1",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        profile_image: "http://img/pic.png",
        created_at: new Date("2025-01-01T00:00:00Z"),
        updated_at: null,
    };

    // ─────────────────────────────────────────────────────────────────────
    describe("getProfile", () => {
        it("returns the profile row when found", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [baseProfileRow], rowCount: 1 });
            const p = await ProfileModel.getProfile("u1");
            expect(p).toEqual(baseProfileRow);
            assertSqlContains(mockPgPool.query, "SELECT * FROM lp_profiles WHERE user_id = $1");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["u1"]);
        });

        it("returns undefined when no profile exists", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            const p = await ProfileModel.getProfile("nobody");
            expect(p).toBeUndefined();
        });

        it("propagates DB errors after logging", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("connection lost"));
            await expect(ProfileModel.getProfile("u1")).rejects.toThrow("connection lost");
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    describe("deleteProfileById", () => {
        it("executes DELETE with the correct user_id", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            await ProfileModel.deleteProfileById("u1");
            assertSqlContains(mockPgPool.query, "DELETE FROM lp_profiles WHERE user_id = $1");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["u1"]);
        });

        it("propagates DB errors after logging", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("read-only transaction"));
            await expect(ProfileModel.deleteProfileById("u1")).rejects.toThrow(
                "read-only transaction"
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    describe("updateProfile", () => {
        it("returns the updated profile on success", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [baseProfileRow], rowCount: 1 });
            const p = await ProfileModel.updateProfile("u1", baseUserData);
            expect(p).toEqual(baseProfileRow);
            assertSqlContains(mockPgPool.query, "UPDATE lp_profiles");
            assertSqlContains(mockPgPool.query, "SET");
            assertSqlContains(mockPgPool.query, "username = $1");
            assertSqlContains(mockPgPool.query, "first_name = $2");
            assertSqlContains(mockPgPool.query, "last_name = $3");
            assertSqlContains(mockPgPool.query, "profile_image = $4");
            assertSqlContains(mockPgPool.query, "updated_at = now()");
            assertSqlContains(mockPgPool.query, "WHERE user_id = $5");
            const params = mockPgPool.query.mock.calls[0][1];
            expect(params).toEqual([
                baseUserData.username,
                baseUserData.first_name,
                baseUserData.last_name,
                baseUserData.profile_image,
                "u1",
            ]);
        });

        it("throws BadRequestError with 'Profile not found' when no row is updated", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(ProfileModel.updateProfile("nobody", baseUserData)).rejects.toBeInstanceOf(
                BadRequestError
            );
            // The model catches BadRequestError and re-throws it as-is, so we get the
            // original "Profile not found" message, not the generic fallback.
            await expect(ProfileModel.updateProfile("nobody", baseUserData)).rejects.toThrow(
                "Profile not found"
            );
        });

        it("maps Postgres unique violation (23505) to BadRequestError 'Username already exists'", async () => {
            const err: any = new Error("duplicate key");
            err.code = "23505";
            mockPgPool.query.mockRejectedValueOnce(err);
            await expect(ProfileModel.updateProfile("u1", baseUserData)).rejects.toThrow(
                "Username already exists. Choose another username."
            );
        });

        it("wraps unexpected DB errors as generic BadRequestError", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("deadlock"));
            await expect(ProfileModel.updateProfile("u1", baseUserData)).rejects.toThrow(
                "Something went wrong!"
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    describe("createProfile", () => {
        it("returns the inserted row on success", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [baseProfileRow], rowCount: 1 });
            const p = await ProfileModel.createProfile(baseUserData);
            expect(p).toEqual(baseProfileRow);
            assertSqlContains(mockPgPool.query, "INSERT INTO lp_profiles");
            assertSqlContains(mockPgPool.query, "user_id, username, first_name, last_name, profile_image");
            assertSqlContains(mockPgPool.query, "RETURNING *");
            const params = mockPgPool.query.mock.calls[0][1];
            expect(params).toEqual([
                baseUserData.user_id,
                baseUserData.username,
                baseUserData.first_name,
                baseUserData.last_name,
                baseUserData.profile_image,
            ]);
        });

        it("wraps Postgres unique violation (23505) as generic Error", async () => {
            const err: any = new Error("duplicate key");
            err.code = "23505";
            mockPgPool.query.mockRejectedValueOnce(err);
            await expect(ProfileModel.createProfile(baseUserData)).rejects.toThrow(
                "Create profile error"
            );
        });

        it("propagates other DB errors", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("disk full"));
            await expect(ProfileModel.createProfile(baseUserData)).rejects.toThrow("disk full");
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    describe("profileIfNotExists", () => {
        it("returns the existing row when a profile is found", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{ user_id: "u1" }], rowCount: 1 });
            const p = await ProfileModel.profileIfNotExists("u1");
            expect(p).toEqual({ user_id: "u1" });
            assertSqlContains(mockPgPool.query, "SELECT user_id FROM lp_profiles WHERE user_id = $1");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["u1"]);
        });

        it("returns undefined when no profile exists", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            const p = await ProfileModel.profileIfNotExists("nobody");
            expect(p).toBeUndefined();
        });

        it("propagates DB errors after logging", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("timeout"));
            await expect(ProfileModel.profileIfNotExists("u1")).rejects.toThrow("timeout");
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    describe("createProfileIfNotExists", () => {
        it("returns the upserted row on success", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [baseProfileRow], rowCount: 1 });
            const p = await ProfileModel.createProfileIfNotExists("u1", "a@b.com");
            expect(p).toEqual(baseProfileRow);
            assertSqlContains(mockPgPool.query, "INSERT INTO lp_profiles");
            assertSqlContains(mockPgPool.query, "ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username");
            assertSqlContains(mockPgPool.query, "RETURNING *");
            const params = mockPgPool.query.mock.calls[0][1];
            expect(params).toEqual(["u1", "a@b.com"]);
        });

        it("wraps Postgres unique violation (23505) as generic Error", async () => {
            const err: any = new Error("duplicate key");
            err.code = "23505";
            mockPgPool.query.mockRejectedValueOnce(err);
            await expect(
                ProfileModel.createProfileIfNotExists("u1", "a@b.com")
            ).rejects.toThrow("Create profile error");
        });

        it("propagates other DB errors", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("out of memory"));
            await expect(
                ProfileModel.createProfileIfNotExists("u1", "a@b.com")
            ).rejects.toThrow("out of memory");
        });
    });
});
