/**
 * Shared Jest setup — runs BEFORE every test file (unit + integration).
 *
 * 1. Loads services/auth/.env.test when present. The integration suite
 *    points POSTGRES_DATABASE_URL at a dedicated Neon TEST database through
 *    it — never the dev database.
 * 2. Fills test-safe defaults for env vars that src/ modules read AT IMPORT
 *    TIME, so importing the app never throws (e.g. the social-auth modules
 *    throw at load when provider client ids are unset).
 *
 * Order matters: this file executes before a test file imports any src/
 * module, so process.env is fully populated before src/db/index.ts builds
 * its Pool.
 */
import fs from "fs";
import path from "path";
import { config as dotenvConfig } from "dotenv";

const TEST_ENV = path.resolve(__dirname, "..", ".env.test");
if (fs.existsSync(TEST_ENV)) {
    dotenvConfig({ path: TEST_ENV, override: true, quiet: true });
}

process.env.NODE_ENV = "test";

// validateEnv() refuses to start without a 64-hex JWT_KEY.
process.env.JWT_KEY ||= "a".repeat(64);
process.env.KAFKA_BROKER ||= "localhost:9092";
process.env.REDIS_URL ||= "redis://localhost:6379";

// Social-auth module imports throw when these are unset. Tests never call
// the real providers (validators are mocked), so dummy values suffice.
process.env.GOOGLE_WEB_CLIENT_ID ||= "test-google-client-id";
process.env.FACEBOOK_APP_ID ||= "test-facebook-app-id";
process.env.FACEBOOK_APP_SECRET ||= "test-facebook-app-secret";

// Unit tests mock pgPool entirely (they never connect). Integration tests
// require a dedicated test database — the integration suite refuses to run
// unless AUTH_TEST_POSTGRES_DATABASE_URL (from .env.test) points at a
// database whose name contains "test".
const testDbUrl = process.env.AUTH_TEST_POSTGRES_DATABASE_URL?.trim() || "";
if (testDbUrl) {
    process.env.POSTGRES_DATABASE_URL = testDbUrl;
} else {
    process.env.POSTGRES_DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
}