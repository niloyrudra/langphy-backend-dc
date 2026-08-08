import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { mockPool, assertSqlContains } from "../../helpers/mock-pg.js";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

import { OtpModel } from "../../../src/models/otp.model.js";

describe("OtpModel", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
    });

    describe("generateOtp", () => {
        it("returns a 6-digit numeric string", () => {
            for (let i = 0; i < 50; i++) {
                const otp = OtpModel.generateOtp();
                expect(otp).toMatch(/^\d{6}$/);
                const n = parseInt(otp, 10);
                expect(n).toBeGreaterThanOrEqual(100_000);
                expect(n).toBeLessThan(1_000_000);
            }
        });

        it("uses crypto.randomInt (not Math.random)", () => {
            const spy = jest.spyOn(require("crypto"), "randomInt");
            OtpModel.generateOtp();
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    describe("hash", () => {
        it("produces a stable SHA-256 hex digest", () => {
            expect(OtpModel.hash("123456")).toBe(OtpModel.hash("123456"));
            expect(OtpModel.hash("123456")).not.toBe(OtpModel.hash("654321"));
            expect(OtpModel.hash("123456")).toHaveLength(64);
        });
    });

    describe("upsert", () => {
        it("uses ON CONFLICT (email) DO UPDATE", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await OtpModel.upsert("a@b.com", "123456");
            assertSqlContains(mockPgPool.query, "ON CONFLICT (email) DO UPDATE");
        });
    });

    describe("verify (atomic UPDATE...RETURNING)", () => {
        it("uses a single UPDATE statement — no SELECT-then-UPDATE pair", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await OtpModel.verify("a@b.com", "123456");
            const calls = mockPgPool.query.mock.calls;
            expect(calls).toHaveLength(1);
            const sql = calls[0][0] as string;
            expect(sql.trim().toUpperCase()).toMatch(/^UPDATE\s+OTP_VERIFICATIONS/i);
            expect(sql).toContain("RETURNING email");
            // The WHERE clause must include all four guards:
            expect(sql).toContain("otp_hash");
            expect(sql).toContain("used = false");
            expect(sql).toContain("expires_at > now()");
        });

        it("returns true when rowCount === 1", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [{ email: "a@b.com" }], rowCount: 1 });
            await expect(OtpModel.verify("a@b.com", "123456")).resolves.toBe(true);
        });

        it("returns false when rowCount === 0", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await expect(OtpModel.verify("a@b.com", "wrong")).resolves.toBe(false);
        });

        it("does NOT swallow DB errors", async () => {
            mockPgPool.query.mockRejectedValueOnce(new Error("db is down"));
            await expect(OtpModel.verify("a@b.com", "123456")).rejects.toThrow("db is down");
        });
    });

    describe("cleanup", () => {
        it("deletes by email", async () => {
            mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            await OtpModel.cleanup("a@b.com");
            expect(mockPgPool.query.mock.calls[0][1]).toEqual(["a@b.com"]);
        });
    });
});