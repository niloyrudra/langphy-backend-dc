import "express-async-errors";
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import type { Server } from "http";

import { signInRouter } from "./routes/signin.js";
import { signOutRouter } from "./routes/signout.js";
import { signUpRouter } from "./routes/signup.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { dbRouter } from "./routes/db-route.js";
import { resetPasswordByEmailRouter } from "./routes/reset-password.js";
import { deleteAccountRouter } from "./routes/delete-account.js";

import { initProducer, getProducer, setOutboxWriter } from "./kafka/producer.js";
import { startOutboxPublisher, stopOutboxPublisher } from "./kafka/outbox.publisher.js";

import { pgPool } from "./db/index.js";
import { closeRedis } from "./config/redis.js";
import { validateEnv } from "./config/env.js";
import { OutboxRepo } from "./repos/outbox.repo.js";

// ─────────────────────────────────────────────────────────────────────────
// 1. Validate env BEFORE we open any sockets. Bad config should fail fast.
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

const allowedOrigins: string[] = process.env.CORS_ORIGIN
    ? [process.env.CORS_ORIGIN].filter((origin) => {
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
    })
);

app.use(bodyParser.json({ limit: "1mb" }));

// ─────────────────────────────────────────────────────────────────────────
// 3. Routers
// ─────────────────────────────────────────────────────────────────────────
app.use(dbRouter);
app.use(signInRouter);
app.use(signOutRouter);
app.use(signUpRouter);
app.use(resetPasswordByEmailRouter);
app.use(deleteAccountRouter);

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

    // 1. Stop the outbox poller first — don't publish during shutdown.
    await stopOutboxPublisher().catch((err) =>
        console.error("[shutdown] outbox stop failed:", err)
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

    // 3. Disconnect the Kafka producer (flush in-flight).
    try {
        const producer = getProducer();
        await producer.disconnect();
        console.log("[shutdown] kafka producer disconnected");
    } catch (err) {
        console.error("[shutdown] kafka disconnect failed:", err);
    }

    // 4. Close the Redis client.
    await closeRedis().catch((err) =>
        console.error("[shutdown] redis close failed:", err)
    );

    // 5. Drain the Postgres pool last so all DB writes complete.
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
        await initProducer();
        console.log("Kafka Auth Producer connected successfully!");
    } catch (err) {
        console.error("Kafka Producer failed to connect, shutting down service:", err);
        process.exit(1);
    }

    // Wire the outbox writer to use the shared pgPool client connection
    // pattern. The producer.ts publishers route through this writer instead
    // of calling producer.send() directly — that's what makes the publish
    // durable (COMMIT'd before we ever talk to Kafka).
    setOutboxWriter({
        async enqueueEvent(event) {
            const client = await pgPool.connect();
            try {
                await client.query("BEGIN");
                await OutboxRepo.enqueue(client, event);
                await client.query("COMMIT");
            } catch (err) {
                await client.query("ROLLBACK").catch(() => {});
                throw err;
            } finally {
                client.release();
            }
        },
    });

    // Start the publisher AFTER the writer is wired.
    startOutboxPublisher(getProducer());

    httpServer = app.listen(port, "::", () => {
        console.log(`Auth Service listening on port ${port}`);
        console.log("KAFKA_BROKER:", process.env.KAFKA_BROKER);
    });
};

start();