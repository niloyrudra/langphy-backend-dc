import rateLimit, { type ValueDeterminingMiddleware } from "express-rate-limit";
import type { Request, Response, RequestHandler } from "express";

/**
 * Per-endpoint rate limiters. Using memory store for local development.
 * Redis store has compatibility issues with rate-limit-redis + ioredis.
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
): RequestHandler =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        // Use default memory store (no Redis)
        keyGenerator: ((req: Request, _res: Response) => req.ip ?? "unknown") as unknown as ValueDeterminingMiddleware<string>,
        handler: (_req, res) => {
            res.status(429).json({
                errors: [{ message }],
            });
        },
    }) as unknown as RequestHandler;

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

// 10 social auth attempts per minute per IP. Mirrors OTP limiter.
export const socialAuthLimiter = makeLimiter(
    60 * 1000,
    10,
    "social-auth",
    "Too many attempts. Please try again in a minute."
);

// 10 account deletion attempts per 15 min per IP. Deleting an account is
// high-impact and irreversible; a stolen (or leaked) JWT shouldn't get
// unlimited tries at it.
export const deleteAccountLimiter = makeLimiter(
    15 * 60_000,
    10,
    "delete-account",
    "Too many account deletion attempts. Please try again later."
);