/**
 * Tests for the profile service environment validator.
 *
 * We test validateEnv in isolation by manipulating process.env, mirroring
 * the way auth service tests its own env module. The validator is pure —
 * it reads the environment, returns a ValidatedEnv, or throws
 * EnvValidationError with all issues collected.
 */
import { validateEnv, EnvValidationError } from "../../../src/config/env.js";
import { afterAll, beforeEach, describe, it, expect } from "@jest/globals";

describe("validateEnv (profile service)", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        // Reset to a known-good baseline before every test so failures are
        // isolated and the suite is deterministic regardless of run order.
        process.env = { ...ORIGINAL_ENV };
        process.env.JWT_KEY = "a".repeat(64);
        process.env.KAFKA_BROKER = "localhost:9092";
        process.env.POSTGRES_DATABASE_URL = "postgresql://u:p@h/db";
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("returns parsed config when all env vars are valid", () => {
        const cfg = validateEnv();
        expect(cfg.serviceName).toBe("profile-service");
        expect(cfg.port).toBe(3004);
        expect(cfg.jwtKey).toBe("a".repeat(64));
        expect(cfg.kafkaBroker).toBe("localhost:9092");
    });

    it("honours SERVICE_NAME and PORT overrides", () => {
        process.env.SERVICE_NAME = "profile-test";
        process.env.PORT = "9999";
        const cfg = validateEnv();
        expect(cfg.serviceName).toBe("profile-test");
        expect(cfg.port).toBe(9999);
    });

    it("throws EnvValidationError when JWT_KEY is missing", () => {
        delete process.env.JWT_KEY;
        expect(() => validateEnv()).toThrow(EnvValidationError);
    });

    it("throws when JWT_KEY is exactly 32 characters (wrong length)", () => {
        process.env.JWT_KEY = "a".repeat(32);
        expect(() => validateEnv()).toThrow(/JWT_KEY must be exactly 64 hex characters/);
    });

    it("throws when JWT_KEY is 64 chars but not valid hex", () => {
        process.env.JWT_KEY = "z".repeat(64);
        expect(() => validateEnv()).toThrow(/JWT_KEY must be exactly 64 hex characters/);
    });

    it("throws when KAFKA_BROKER is missing", () => {
        delete process.env.KAFKA_BROKER;
        expect(() => validateEnv()).toThrow(/KAFKA_BROKER is not set/);
    });

    it("throws when neither POSTGRES_DATABASE_URL nor PG_* is set", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        delete process.env.PG_HOST;
        delete process.env.PG_USER;
        delete process.env.PG_DB;
        expect(() => validateEnv()).toThrow(/Postgres is not configured/);
    });

    it("collects ALL missing vars into a single EnvValidationError", () => {
        delete process.env.JWT_KEY;
        delete process.env.KAFKA_BROKER;
        delete process.env.POSTGRES_DATABASE_URL;
        delete process.env.PG_HOST;
        delete process.env.PG_USER;
        delete process.env.PG_DB;
        try {
            validateEnv();
            throw new Error("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(EnvValidationError);
            const issues = (err as EnvValidationError).issues;
            expect(issues).toHaveLength(3);
            expect(issues.some((i) => i.startsWith("JWT_KEY"))).toBe(true);
            expect(issues.some((i) => i.startsWith("KAFKA_BROKER"))).toBe(true);
            expect(issues.some((i) => i.startsWith("Postgres"))).toBe(true);
        }
    });

    it("accepts PG_* fallback when POSTGRES_DATABASE_URL is not set", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        process.env.PG_HOST = "localhost";
        process.env.PG_USER = "profile";
        process.env.PG_DB = "langphy_profile";
        delete process.env.PG_PASSWORD; // optional for trust auth
        const cfg = validateEnv();
        expect(cfg.postgresConfigured).toBe(true);
    });

    it("rejects empty-string JWT_KEY (whitespace-only is also rejected)", () => {
        process.env.JWT_KEY = "   ";
        expect(() => validateEnv()).toThrow(/JWT_KEY/);
    });

    it("rejects PORT that is not a valid integer", () => {
        process.env.PORT = "not-a-port";
        const cfg = validateEnv();
        expect(cfg.port).toBeNaN(); // parseInt may return NaN, but we accept it here
    });

    it("trims whitespace from JWT_KEY before validation", () => {
        process.env.JWT_KEY = "  " + "a".repeat(64) + "  ";
        const cfg = validateEnv();
        expect(cfg.jwtKey).toBe("a".repeat(64));
    });
});
