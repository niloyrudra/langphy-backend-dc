/**
 * Tests for the streaks service env validation.
 *
 * Mirrors services/auth/tests/unit/config/env.test.ts. Validates that
 * JWT_KEY is 64-hex, KAFKA_BROKER is required, and Postgres can be
 * configured via either POSTGRES_DATABASE_URL or PG_* env vars.
 */

import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import { parsePgConfig, PgConfigError } from "@langphy/shared";
import {
    validateEnv,
    EnvValidationError,
} from "../../../src/config/env";

describe("parsePgConfig (via validateEnv's required inputs)", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("prefers POSTGRES_DATABASE_URL and injects application_name", () => {
        process.env.POSTGRES_DATABASE_URL =
            "postgresql://u:p@h.example.com/db?sslmode=require";
        const cfg = parsePgConfig({ serviceName: "langphy-streaks" });
        expect(cfg.connectionString).toContain(
            "application_name=langphy-streaks",
        );
        expect(cfg.application_name).toBe("langphy-streaks");
    });

    it("falls back to PG_* env vars", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        process.env.PG_HOST = "127.0.0.1";
        process.env.PG_PORT = "5433";
        process.env.PG_USER = "alice";
        process.env.PG_PASSWORD = "secret";
        process.env.PG_DB = "langphy_streaks";
        const cfg = parsePgConfig({ serviceName: "langphy-streaks" });
        expect(cfg.connectionString).toContain("127.0.0.1:5433");
        expect(cfg.connectionString).toContain("/langphy_streaks");
        const u = new URL(cfg.connectionString);
        expect(u.username).toBe("alice");
        expect(u.password).toBe("secret");
    });

    it("errors when no URL and no PG_*", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        delete process.env.PG_HOST;
        delete process.env.PG_USER;
        delete process.env.PG_DB;
        expect(() =>
            parsePgConfig({ serviceName: "langphy-streaks" }),
        ).toThrow(/missing/i);
    });

    it("rejects malformed URL", () => {
        process.env.POSTGRES_DATABASE_URL = "not::a::url";
        expect(() =>
            parsePgConfig({ serviceName: "langphy-streaks" }),
        ).toThrow(PgConfigError);
    });
});

describe("validateEnv", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
        process.env.JWT_KEY = "a".repeat(64);
        process.env.KAFKA_BROKER = "localhost:9092";
        process.env.POSTGRES_DATABASE_URL =
            "postgresql://u:p@h.example.com/db";
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("returns parsed config when valid", () => {
        const cfg = validateEnv();
        expect(cfg.serviceName).toBe("streaks-service");
        expect(cfg.port).toBe(3001);
        expect(cfg.postgresConfigured).toBe(true);
        expect(cfg.jwtKey).toHaveLength(64);
    });

    it("defaults serviceName and port when env unset", () => {
        delete process.env.SERVICE_NAME;
        delete process.env.PORT;
        const cfg = validateEnv();
        expect(cfg.serviceName).toBe("streaks-service");
        expect(cfg.port).toBe(3001);
    });

    it("throws EnvValidationError when JWT_KEY is missing", () => {
        delete process.env.JWT_KEY;
        expect(() => validateEnv()).toThrow(EnvValidationError);
    });

    it("throws when JWT_KEY is the wrong length", () => {
        process.env.JWT_KEY = "abc";
        expect(() => validateEnv()).toThrow(/JWT_KEY/);
    });

    it("throws when neither Postgres URL nor PG_* is set", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        delete process.env.PG_HOST;
        delete process.env.PG_USER;
        delete process.env.PG_DB;
        expect(() => validateEnv()).toThrow(/Postgres/);
    });

    it("throws when KAFKA_BROKER is missing", () => {
        delete process.env.KAFKA_BROKER;
        expect(() => validateEnv()).toThrow(/KAFKA_BROKER/);
    });
});