import { beforeEach, describe, it, expect } from "@jest/globals";
import { validateEnv, EnvValidationError } from "../../../src/config/env.js";

describe("validateEnv", () => {
    const baseEnv = {
        JWT_KEY: "a".repeat(64),
        KAFKA_BROKER: "localhost:9092",
        POSTGRES_DATABASE_URL: "postgresql://test:test@localhost:5432/test",
        PORT: "3009",
        SERVICE_NAME: "gateway-service",
    };

    beforeEach(() => {
        // Reset process.env to base for each test
        process.env = { ...baseEnv };
    });

    it("returns validated config when all required vars are present", () => {
        const cfg = validateEnv();
        expect(cfg.jwtKey).toBe("a".repeat(64));
        expect(cfg.kafkaBroker).toBe("localhost:9092");
        expect(cfg.port).toBe(3009);
        expect(cfg.serviceName).toBe("gateway-service");
        expect(cfg.postgresConfigured).toBe(true);
    });

    it("throws EnvValidationError when JWT_KEY is missing", () => {
        delete process.env.JWT_KEY;
        expect(() => validateEnv()).toThrow(EnvValidationError);
        expect(() => validateEnv()).toThrow("JWT_KEY is not set");
    });

    it("throws EnvValidationError when JWT_KEY is not 64 hex chars", () => {
        process.env.JWT_KEY = "short";
        expect(() => validateEnv()).toThrow(EnvValidationError);
        expect(() => validateEnv()).toThrow("JWT_KEY must be exactly 64 hex characters");
    });

    it("throws EnvValidationError when KAFKA_BROKER is missing", () => {
        delete process.env.KAFKA_BROKER;
        expect(() => validateEnv()).toThrow(EnvValidationError);
        expect(() => validateEnv()).toThrow("KAFKA_BROKER is not set");
    });

    it("throws EnvValidationError when Postgres is not configured", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        delete process.env.PG_HOST;
        expect(() => validateEnv()).toThrow(EnvValidationError);
        expect(() => validateEnv()).toThrow("Postgres is not configured");
    });

    it("accepts PG_HOST/PG_USER/PG_DB as alternative Postgres config", () => {
        delete process.env.POSTGRES_DATABASE_URL;
        process.env.PG_HOST = "localhost";
        process.env.PG_USER = "test";
        process.env.PG_DB = "test";

        const cfg = validateEnv();
        expect(cfg.postgresConfigured).toBe(true);
    });

    it("uses default port 3009 when PORT not set", () => {
        delete process.env.PORT;
        const cfg = validateEnv();
        expect(cfg.port).toBe(3009);
    });

    it("uses default service name when SERVICE_NAME not set", () => {
        delete process.env.SERVICE_NAME;
        const cfg = validateEnv();
        expect(cfg.serviceName).toBe("gateway-service");
    });

    it("includes corsOrigin when CORS_ORIGIN is set", () => {
        process.env.CORS_ORIGIN = "https://example.com";
        const cfg = validateEnv();
        expect(cfg.corsOrigin).toBe("https://example.com");
    });

    it("returns corsOrigin as-is from CORS_ORIGIN (filtering happens in index.ts)", () => {
        process.env.CORS_ORIGIN = "not-a-url";
        const cfg = validateEnv();
        expect(cfg.corsOrigin).toBe("not-a-url");
    });
});