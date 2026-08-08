import { Redis } from "ioredis";

/**
 * Single Redis client used by the rate limiter.
 *
 * - Reads REDIS_URL (e.g. `redis://localhost:6379` or `rediss://...` for TLS).
 * - `lazyConnect: false` so connection errors surface during boot rather than
 *   at the first rate-limited request.
 * - `enableOfflineQueue: false` so requests fail fast if Redis goes down
 *   instead of piling up in the queue.
 *
 * For multi-instance deployments this gives all replicas a shared rate-limit
 * counter. Single-instance Railway deploys still benefit because the counter
 * survives a process restart.
 */
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: false,
});

redis.on("connect", () => {
    console.log("✅ Connected to Redis (auth)");
});

redis.on("error", (err: Error) => {
    console.error("[redis] error:", err.message);
});

/** Graceful close — call from shutdown handlers. */
export async function closeRedis(): Promise<void> {
    await redis.quit().catch(() => {});
}