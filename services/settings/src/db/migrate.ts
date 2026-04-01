import fs from "fs";
import path from "path";
import { pgPool } from "./index.js";

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  "src/db/migrations"
);

const waitForDb = async (retries = 10) => {
  while (retries--) {
    try {
      await pgPool.query("SELECT 1");
      return;
    } catch {
      console.log("Waiting for DB...");
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error("DB not reachable");
};

export const runMigrations = async () => {
  await waitForDb();
  const client = await pgPool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        executed_at TIMESTAMP NOT NULL
      )
    `);

    const executed = await client.query(
      "SELECT filename FROM schema_migrations"
    );

    const executedFiles = new Set(
      executed.rows.map(row => row.filename)
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (executedFiles.has(file)) continue;

      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, file),
        "utf-8"
      );

      console.log(`Running migration: ${file}`);
      await client.query(sql);

      await client.query(
        `INSERT INTO schema_migrations (filename, executed_at)
         VALUES ($1, NOW())`,
        [file]
      );
    }
  } finally {
    client.release();
  }
};

// ── Run when executed directly ─────────────────────────────────────────
// This block runs when called via: node dist/db/migrate.js
// It does NOT run when imported by index.ts
runMigrations()
  .then(() => {
    console.log("✅ Migrations complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });