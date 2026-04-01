import express, { json } from "express";
import { pgPool } from "./db/index.js";
import { startKafka, stopKafka, kafkaReady } from "./kafka/index.js";
import { dbRouter } from "./routes/db-route.js";
import { StreaksRouter } from "./routes/streaks.js";
import { errorHandler } from "./middlewares/error-handler.js";

const app = express();
app.use(json());

// Routers
app.use(dbRouter);
app.use(StreaksRouter);

// Error handling middleware
app.use(errorHandler);

// Health & readiness
let dbReady = false;
app.get("/health", (_req, res) => res.status(200).send("OK"));
app.get("/ready", (_req, res) => {
  if (dbReady && kafkaReady) res.status(200).send("READY");
  else res.status(503).send("NOT READY");
});

// PostgreSQL connect listener
pgPool.on("connect", () => {
  console.log("✅ Connect to Streaks PostgreSQL");
  dbReady = true;
});

// Start Kafka subsystem
async function init() {
  try {
    await startKafka();
  } catch (err) {
    console.error("❌ Kafka subsystem failed", err);
  }
}

// Start HTTP server
const PORT = 3001;
const server = app.listen(PORT, () => console.log(`🚀 Streaks service listening on ${PORT}`));

// Graceful shutdown
async function shutdown() {
  console.log("🧯 Received SIGTERM/SIGINT");
  server.close(() => console.log("✅ HTTP server stopped"));
  await pgPool.end().then(() => console.log("✅ PostgreSQL pool closed"));
  await stopKafka();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

init();