import { Pool } from "pg";
import { parsePgConfig } from "@langphy/shared";

/**
 * Connection pool for the vocab-arena service.
 *
 * - Reads POSTGRES_DATABASE_URL (Neon) or falls back to PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DB.
 * - SSL is REQUIRED (rejectUnauthorized: true) — Neon terminates TLS at the gateway.
 * - application_name is set so connections show up as `langphy-vocab-arena`
 *   in the Neon dashboard.
 * - Pool sizing: max 10 keeps us well under Neon's per-database limit;
 *   idleTimeout recycles connections so we don't burn minutes on a
 *   stale socket.
 */
const cfg = parsePgConfig({ serviceName: "langphy-vocab-arena" });

export const pgPool = new Pool({
    connectionString: cfg.connectionString,
    application_name: cfg.application_name,
    ssl: { rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

pgPool.on("connect", () => {
    console.log("✅ Connected to PostgreSQL (vocab-arena)");
});

pgPool.on("error", (err) => {
    console.error("VOCAB-ARENA — Unexpected error on idle PostgreSQL client", err);
});