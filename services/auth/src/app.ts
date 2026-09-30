import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";

import { signInRouter } from "./routes/signin.js";
import { signOutRouter } from "./routes/signout.js";
import { signUpRouter } from "./routes/signup.js";
import { socialAuthRouter } from "./routes/social-auth.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { dbRouter } from "./routes/db-route.js";
import { resetPasswordByEmailRouter } from "./routes/reset-password.js";
import { deleteAccountRouter } from "./routes/delete-account.js";

/**
 * Build the Express app: middleware order + routers + error handling.
 *
 * Extracted from index.ts so the API can be integration-tested through the
 * REAL request pipeline (including errorHandler) without binding a socket,
 * connecting to Kafka, or starting the outbox publisher.
 */
export const createApp = (): Express => {
    const app: Express = express();

    // ── Security / parsing middleware ─────────────────────────────────
    app.use(helmet());

    // Trust the single Caddy hop in front of us. Without this, req.ip is
    // Caddy's address and every user shares ONE rate-limit bucket.
    app.set("trust proxy", 1);

    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(express.json({ limit: "1mb" }));

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

    // ── Routers ───────────────────────────────────────────────────────
    app.use(dbRouter);
    app.use(signInRouter);
    app.use(signOutRouter);
    app.use(signUpRouter);
    app.use(socialAuthRouter);
    app.use(resetPasswordByEmailRouter);
    app.use(deleteAccountRouter);

    // ── 404 — JSON shape matching the rest of the API (not Express HTML) ──
    app.use((_req, res) => {
        res.status(404).json({ errors: [{ message: "Route not found!" }] });
    });

    // ── Error handler (must be registered last) ────────────────────────
    app.use(errorHandler);

    return app;
};