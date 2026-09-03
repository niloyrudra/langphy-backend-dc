import { Pool } from "pg";
import { parsePgConfig } from "@langphy/shared";

/**
 * Connection pool for the progress service.
 *
 * - Reads POSTGRES_DATABASE_URL (Neon) or falls back to PG_HOST/PORT/USER/PASSWORD/PG_DB.
 * - SSL is REQUIRED (rejectUnauthorized: true) — Neon terminates TLS at the gateway.
 * - application_name is set so connections show up as `langphy-progress`
 *   in the Neon dashboard.
 */
const cfg = parsePgConfig({ serviceName: "langphy-progress" });

export const pgPool = new Pool({
    connectionString: cfg.connectionString,
    application_name: cfg.application_name,
    ssl: { rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

pgPool.on("connect", () => {
    console.log("✅ Connected to PostgreSQL (progress)");
});

pgPool.on("error", (err) => {
    console.error("PROGRESS — Unexpected error on idle PostgreSQL client", err);
});