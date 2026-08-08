/**
 * Tests for the Neon Postgres connection URL parser and validateEnv.
 */

import { parsePgConfig, PgConfigError } from "@langphy/shared";
import { validateEnv, EnvValidationError } from "../../../src/config/env";
import { beforeEach, describe, it } from "@jest/globals";

describe("parsePgConfig", () => {
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
        const cfg = parsePgConfig({ serviceName: "langphy-auth" });
        expect(cfg.connectionString).toContain("application_name=langphy-auth");
        expect(cfg.application_name).toBe("langphy-auth");
    });

    it("preserves a user-provided application_name", () => {
        process.env.POSTGRES_DATABASE_URL =
            "postgresql://u:p@h/db?application_name=custom&sslmode=require";
        const cfg = parsePgConfig({ serviceName: "langphy-auth" });
        expect(cfg.application_name).toBe("custom");
    });

    it("rejects malformed URL", () => {
        process.env.POSTGRES_DATABASE_URL = "not::a::url";
        expect(() => parsePgConfig({ serviceName: "x" })).toThrow(PgConfigError);
    });

    it("rejects non-postgres URL", () => {
        process.env.POSTGRES_DATABASE_URL = "http://example.com/db";
        expect(() => parsePgConfig({ serviceName: "x" })).toThrow(/scheme/);
    });

    it("falls back to PG_* env vars", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        process.env.PG_HOST = "127.0.0.1";
        process.env.PG_PORT = "5433";
        process.env.PG_USER = "bob";
        process.env.PG_PASSWORD = "secret";
        process.env.PG_DB = "mydb";
        const cfg = parsePgConfig({ serviceName: "x" });
        expect(cfg.connectionString).toContain("127.0.0.1:5433");
        expect(cfg.connectionString).toContain("/mydb");
        // Credentials end up in the URL's user:pass@host section, not as
        // query string — verify the URL is structurally correct.
        const u = new URL(cfg.connectionString);
        expect(u.username).toBe("bob");
        expect(u.password).toBe("secret");
        expect(u.searchParams.get("application_name")).toBe("x");
    });

    it("errors when no URL and no PG_*", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        delete process.env.PG_HOST;
        delete process.env.PG_USER;
        delete process.env.PG_DB;
        expect(() => parsePgConfig({ serviceName: "x" })).toThrow(/missing/i);
    });

    it("errors when requireUrl: true and no URL", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        expect(() => parsePgConfig({ serviceName: "x", requireUrl: true })).toThrow(
            /required/
        );
    });
});

describe("validateEnv", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
        process.env.JWT_KEY = "a".repeat(64);
        process.env.KAFKA_BROKER = "localhost:9092";
        process.env.POSTGRES_DATABASE_URL = "postgresql://u:p@h/db";
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("returns parsed config when valid", () => {
        const cfg = validateEnv();
        expect(cfg.serviceName).toBe("auth-service");
        expect(cfg.port).toBe(3000);
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
});

function expect<T>(actual: T) {
    return (globalThis as any).expect(actual);
}
function afterAll(arg0: () => void) {
    throw new Error("Function not implemented.");
}

