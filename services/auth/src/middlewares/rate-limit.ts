import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type { Request } from "express";
import { redis } from "../config/redis.js";

/**
 * Per-endpoint rate limiters. All backed by a shared Redis instance so
 * counts are consistent across replicas and survive restarts.
 *
 * Keys are prefixed with `rl:<name>:` so they don't collide with
 * other Redis users (queues, sessions, etc).
 *
 * `keyGenerator` falls back to `req.ip` — which respects Express's
 * `trust proxy` setting. The default key is the request IP, which is
 * the right granularity for unauthenticated endpoints (signin, signup).
 */

const makeLimiter = (
    windowMs: number,
    max: number,
    keyPrefix: string,
    message: string
) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
            sendCommand: (...args: string[]) =>
                redis.call(args[0], ...args.slice(1)) as Promise<any>,
            prefix: `rl:${keyPrefix}:`,
        }),
        keyGenerator: (req: Request) => req.ip ?? "unknown",
        handler: (_req, res) => {
            res.status(429).json({
                errors: [{ message }],
            });
        },
    });

// 10 signin attempts per 15 min per IP. Generous enough that mistyped
// passwords don't lock a user out, tight enough to slow credential stuffing.
export const signinLimiter = makeLimiter(
    15 * 60_000,
    10,
    "signin",
    "Too many signin attempts. Please try again in a few minutes."
);

// 5 OTP requests per hour per IP. Stops email-bombing enumeration.
export const signupOtpLimiter = makeLimiter(
    60 * 60_000,
    5,
    "signup-otp",
    "Too many signup attempts. Please try again later."
);

// 10 verify-otp attempts per 15 min per IP. With 6-digit OTPs this gives
// ~0.0001% chance of guessing a code in the window.
export const verifyOtpLimiter = makeLimiter(
    15 * 60_000,
    10,
    "verify-otp",
    "Too many verification attempts. Please try again later."
);

// 5 reset-password attempts per hour per IP.
export const resetPwLimiter = makeLimiter(
    60 * 60_000,
    5,
    "reset-pw",
    "Too many password reset attempts. Please try again later."
);