import "express-async-errors";
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import type { Server } from "http";

import { StreaksRouter } from "./routes/streaks.js";
import { healthRouter, setKafkaReady } from "./routes/health-route.js";
import { errorHandler } from "./middlewares/error-handler.js";

import { pgPool } from "./db/index.js";
import { validateEnv } from "./config/env.js";

import { initProducer, shutdownProducer } from "./kafka/producer.js";
import { initConsumer } from "./kafka/consumer.js";

// ─────────────────────────────────────────────────────────────────────────
// 1. Validate env BEFORE opening any sockets. Bad config should fail fast.
// ─────────────────────────────────────────────────────────────────────────
let cfg: ReturnType<typeof validateEnv>;
try {
    cfg = validateEnv();
} catch (err) {
    console.error("[startup] env validation failed:", err);
    process.exit(1);
}

const { port } = cfg;

const app: Express = express();

// ─────────────────────────────────────────────────────────────────────────
// 2. Middleware
// ─────────────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const allowedOrigins: string[] = cfg.corsOrigin
    ? [cfg.corsOrigin].filter((origin) => {
        if (!origin || typeof origin !== "string") return false;
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
    }),
);

app.use(bodyParser.json({ limit: "1mb" }));

// ─────────────────────────────────────────────────────────────────────────
// 3. Routers
// ─────────────────────────────────────────────────────────────────────────
app.use(healthRouter);
app.use(StreaksRouter);

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

    // 1. Mark not ready so Railway stops sending traffic.
    setKafkaReady(false);

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

    // 3. Disconnect the Kafka producer (flush in-flight).
    await shutdownProducer().catch((err) =>
        console.error("[shutdown] kafka disconnect failed:", err),
    );

    // 4. Drain the Postgres pool last so all DB writes complete.
    await pgPool.end().catch((err) =>
        console.error("[shutdown] pgPool end failed:", err),
    );

    console.log("[shutdown] done");
    process.exit(0);
};

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
    void gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
    // Don't exit on unhandled rejection — let the request finish and log it.
    // (Exiting here loses in-flight work; the express-async-errors middleware
    // already routes handler rejections to errorHandler.)
    console.error("[FATAL] unhandledRejection:", reason);
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Boot
// ─────────────────────────────────────────────────────────────────────────
const start = async () => {
    try {
        await initProducer();
        console.log("Kafka Streaks Producer connected successfully!");
    } catch (err) {
        console.error(
            "Kafka Producer failed to connect, shutting down service:",
            err,
        );
        process.exit(1);
    }

    // Start the consumer AFTER the producer is ready. The consumer will
    // signal readiness via setKafkaReady() — but KafkaJS's `consumer.run`
    // doesn't return until the loop is set up, so we set the flag
    // synchronously here and let the consumer's own retry handle
    // connection races.
    void initConsumer()
        .then(() => setKafkaReady(true))
        .catch((err) => {
            console.error("[streaks] consumer failed to start", err);
            setKafkaReady(false);
        });

    httpServer = app.listen(port, "::", () => {
        console.log(`Streaks Service listening on port ${port}`);
        console.log("KAFKA_BROKER:", process.env.KAFKA_BROKER);
    });
};

start();