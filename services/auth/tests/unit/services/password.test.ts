import { Password } from "../../../src/services/password.js";
import { describe, it, expect } from "@jest/globals";

describe("Password", () => {
    describe("toHash", () => {
        it("produces a bcrypt hash (starts with $2)", async () => {
            const h = await Password.toHash("hunter22");
            expect(h).toMatch(/^\$2[aby]\$/);
        });

        it("produces different hashes for the same input (salt is random)", async () => {
            const a = await Password.toHash("hunter22");
            const b = await Password.toHash("hunter22");
            expect(a).not.toBe(b);
        });

        it("throws when password is missing", async () => {
            await expect(Password.toHash("" as any)).rejects.toThrow(/required/i);
        });
    });

    describe("compare", () => {
        it("returns true for matching password/hash", async () => {
            const h = await Password.toHash("hunter22");
            expect(await Password.compare(h, "hunter22")).toBe(true);
        });

        it("returns false for wrong password", async () => {
            const h = await Password.toHash("hunter22");
            expect(await Password.compare(h, "WRONG")).toBe(false);
        });

        it("throws when supplied password is missing", async () => {
            await expect(Password.compare("hash", "" as any)).rejects.toThrow(
                /missing/i
            );
        });

        it("throws when stored hash is missing", async () => {
            await expect(Password.compare("", "pw")).rejects.toThrow(/missing/i);
        });
    });
});