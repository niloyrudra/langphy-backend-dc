import "dotenv/config";
import "express-async-errors";
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import type { Server } from "http";

import { ProfileRouter } from "./routes/profile.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { ProfileCreationRouter } from "./routes/profile-create.js";
import { ProfileUpdateRouter } from "./routes/profile-update.js";
import { dbRouter } from "./routes/db-route.js";
import { startProfileConsumers, stopProfileConsumers } from "./kafka/consumer.js";
import { pgPool } from "./db/index.js";
import { validateEnv } from "./config/env.js";

// ─────────────────────────────────────────────────────────────────────────
// 1. Validate env BEFORE we open any sockets. Bad config should fail fast.
// ─────────────────────────────────────────────────────────────────────────
const cfg = (() => {
    try {
        return validateEnv();
    } catch (err) {
        console.error("[startup] env validation failed:", err);
        process.exit(1);
    }
})();

const app: Express = express();

// ─────────────────────────────────────────────────────────────────────────
// 2. Middleware
// ─────────────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const allowedOrigins: string[] = process.env.CORS_ORIGIN
    ? [process.env.CORS_ORIGIN].filter((origin): origin is string => {
          if (!origin) return false;
          try {
              new URL(origin);
              return true;
          } catch {
              return false;
          }
      })
    : ["https://play.google.com"];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
    })
);

app.use(express.json({ limit: "1mb" }));

// ─────────────────────────────────────────────────────────────────────────
// 3. Routers
// ─────────────────────────────────────────────────────────────────────────
app.use(dbRouter);
app.use(ProfileRouter);
app.use(ProfileCreationRouter);
app.use(ProfileUpdateRouter);

app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────
// 4. Graceful shutdown — registered BEFORE start() so a SIGTERM during
//    startup still tears down what was opened.
// ─────────────────────────────────────────────────────────────────────────
let httpServer: Server | undefined;
let shuttingDown = false;

const gracefulShutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, draining…`);

    // 1. Stop the Kafka consumer first — stop consuming before we close HTTP.
    await stopProfileConsumers().catch((err) =>
        console.error("[shutdown] kafka consumer stop failed:", err)
    );

    // 2. Close the HTTP listener so no new connections are accepted.
    await new Promise<void>((resolve) => {
        if (!httpServer) return resolve();
        httpServer.close((err) => {
            if (err) console.error("[shutdown] http close error:", err);
            resolve();
        });
        // Force-exit if close hangs (in-flight requests stuck).
        setTimeout(() => {
            console.warn("[shutdown] forcing exit after 10s timeout");
            process.exit(1);
        }, 10_000).unref();
    });

    // 3. Drain the Postgres pool last so all DB writes complete.
    await pgPool.end().catch((err) =>
        console.error("[shutdown] pgPool end failed:", err)
    );

    console.log("[shutdown] done");
    process.exit(0);
};

process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
});

process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
    void gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
    // Don't exit on unhandled rejection — let the request finish and log it.
    // (Exiting here loses in-flight work; the express-async-errors middleware
    // already routes handler rejections to errorHandler.)
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Boot
// ─────────────────────────────────────────────────────────────────────────
const start = async () => {
    try {
        await startProfileConsumers();
        console.log("Kafka Profile Consumer connected successfully!");
    } catch (err) {
        console.error("Profile Kafka failed to connect, shutting down service:", err);
        process.exit(1);
    }

    httpServer = app.listen(cfg.port, "::", () => {
        console.log(`Profile Service listening on port ${cfg.port}`);
    });
};

start();
