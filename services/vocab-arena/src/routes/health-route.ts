import { Router } from "express";
import { pgPool } from "../db/index.js";

let dbReady = false;
pgPool.on("connect", () => {
    dbReady = true;
});
pgPool.on("error", () => {
    dbReady = false;
});

const router = Router();

/**
 * Liveness — process is up. Always 200 unless the event loop is
 * wedged.
 */
router.get("/health", (_req, res) => {
    res.status(200).send("OK");
});

/**
 * Readiness — can we actually serve traffic? Reports 503 until the DB
 * pool has at least one connection and Kafka is initialised.
 *
 * `kafkaReady` is set by initConsumer() in index.ts after a successful
 * run setup.
 */
export let kafkaReady = false;
export const setKafkaReady = (value: boolean) => {
    kafkaReady = value;
};

router.get("/ready", (_req, res) => {
    if (dbReady && kafkaReady) {
        res.status(200).send("READY");
    } else {
        res.status(503).send("NOT READY");
    }
});

export { router as healthRouter };