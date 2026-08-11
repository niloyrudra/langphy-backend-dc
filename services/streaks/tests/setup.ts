/**
 * Shared test setup. Runs before each test file.
 *
 * Stops dotenv from leaking developer .env values into test runs.
 * Sets a known-good JWT_KEY so the env validator is satisfied.
 */
process.env.NODE_ENV = "test";
process.env.JWT_KEY =
    process.env.JWT_KEY || "a".repeat(64); // 64 hex chars (a = valid hex)
process.env.KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
process.env.POSTGRES_DATABASE_URL =
    process.env.POSTGRES_DATABASE_URL ||
    "postgresql://test:test@localhost:5432/langphy_streaks";