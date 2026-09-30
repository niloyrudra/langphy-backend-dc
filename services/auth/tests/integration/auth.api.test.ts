/**
 * Auth API integration tests — exercise the REAL Express pipeline
 * (createApp) against a dedicated Neon TEST database.
 *
 * Prerequisites:
 *   1. Generate the Neon test database once:
 *        node services/auth/scripts/create-test-db.cjs
 *      This creates `langphy_auth_test` on the same Neon project as the dev
 *      link (AUTH_POSTGRES_DATABASE_URL) and writes services/auth/.env.test
 *      with AUTH_TEST_POSTGRES_DATABASE_URL.
 *   2. Run the suite:
 *        cd services/auth && npm test
 *
 * Safety: the suite REFUSES to run against any database whose name does not
 * contain "test" — it TRUNCATEs tables in beforeAll. If no test DB is
 * configured, every test in this file is skipped.
 *
 * No external services are contacted: the app is built with createApp()
 * (no listeners, no Kafka), Google/Facebook validators are mocked, OTP
 * generation is fixed, and outbox rows are asserted in the DB instead of
 * being consumed by a real Kafka broker.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Express } from "express";
import type { Server } from "http";
import { createServer } from "node:http";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Mock provider validators BEFORE any src/ module is imported — the
// controllers would otherwise call the real Google/Facebook APIs.
jest.mock("../../src/services/google.validator.js", () => ({
    validateGoogleAccessToken: jest.fn(),
}));
jest.mock("../../src/services/facebook.validator.js", () => ({
    validateFacebookAccessToken: jest.fn(),
}));

import { Password } from "../../src/services/password.js";
import { OtpModel } from "../../src/models/otp.model.js";
import * as googleValidator from "../../src/services/google.validator.js";
import * as facebookValidator from "../../src/services/facebook.validator.js";

/**
 * Resolve the test database URL. Guards against accidents: the database name
 * must contain "test" (e.g. langphy_auth_test) or we refuse to run.
 */
function resolveTestDbUrl(env: NodeJS.ProcessEnv = process.env): string | null {
    const url = (env.AUTH_TEST_POSTGRES_DATABASE_URL || env.POSTGRES_DATABASE_URL || "").trim();
    if (!url) return null;
    try {
        const db = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
        return db.includes("test") ? url : null;
    } catch {
        return null;
    }
}

const TEST_DB_URL = resolveTestDbUrl();

// A fixed OTP makes the signup flow deterministic (real OTPs are sha256-hashed at rest).
const FIXED_OTP = "123456";

describe("Auth API (integration)", () => {
    if (!TEST_DB_URL) {
        it.skip("Neon test DB not configured — run: node services/auth/scripts/create-test-db.cjs", () => {});
        return;
    }

    let app: Express;
    let server: Server;
    let base: string;
    let pgPool: any;
    let ipCounter = 0;
    const uniqueIp = () => `198.51.100.${++ipCounter}`;

    // Tiny HTTP client — one request per unique IP so rate limits never leak
    // between tests (each rate-limited endpoint uses per-IP buckets).
    const call = async (
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        urlPath: string,
        opts: { body?: unknown; token?: string; ip?: string } = {}
    ) => {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
        if (opts.ip) headers["X-Forwarded-For"] = opts.ip;
        const res = await fetch(`${base}${urlPath}`, {
            method,
            headers,
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
        const text = await res.text();
        let body: any = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        return { status: res.status, body, headers: res.headers };
    };

const db = {
        query: (sql: string, params: unknown[] = []) => pgPool.query(sql, params),
        truncateAll: async () => {
            await pgPool.query("TRUNCATE lp_users, otp_verifications, outbox_events, deleted_users");
        },
        count: async (table: string, where = "TRUE", params: unknown[] = []) => {
            const r = await pgPool.query(
                `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`,
                params
            );
            return Number(r.rows[0].n);
        },
        findUserByEmail: async (email: string) => {
            const r = await pgPool.query(`SELECT * FROM lp_users WHERE email = $1`, [email]);
            return r.rows[0];
        },
        // The outbox `payload` column stores the FULL envelope:
        // { event_id, event_type, ..., payload: { email, ... } } — so the
        // email sits at payload->payload->email.
        findOutboxByEmail: async (email: string) => {
            const r = await pgPool.query(
                `SELECT * FROM outbox_events WHERE payload #>> '{payload,email}' = $1 ORDER BY occurred_at`,
                [email]
            );
            return r.rows;
        },
    };

    const seedUser = async (email: string, password = "password123") => {
        const hash = await Password.toHash(password);
        const r = await pgPool.query(
            `INSERT INTO lp_users (email, password, provider)
             VALUES ($1, $2, 'email') RETURNING id, email, created_at`,
            [email, hash]
        );
        return r.rows[0];
    };

    const tokenFor = (user: { id: string; email: string; created_at: Date }) =>
        jwt.sign(
            { id: user.id, email: user.email, created_at: user.created_at },
            process.env.JWT_KEY!,
            { expiresIn: "1h" }
        );

    beforeAll(async () => {
        const { createApp } = await import("../../src/app.js");
        const dbMod = await import("../../src/db/index.js");
        pgPool = dbMod.pgPool;
        app = createApp();

        // Bind WITHOUT a host argument: on Node ≥ 24, server.address() is
        // only populated in the default (no-arg) form, which binds IPv6
        // dual-stack `::` — reachable on both 127.0.0.1 and [::1].
        server = createServer(app);
        server.listen(0);
        const addr = server.address() as { port: number };
        base = `http://127.0.0.1:${addr.port}`;

        // Neon autosuspend: wake the branch, then run idempotent migrations.
        for (let i = 0; i < 10; i++) {
            try {
                await pgPool.query("SELECT 1");
                break;
            } catch {
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
        const { runMigrations } = await import("../../src/db/migrate.js");
        await runMigrations();

        // Deterministic OTP so the happy path is reproducible.
        jest.spyOn(OtpModel, "generateOtp").mockReturnValue(FIXED_OTP);
        await db.truncateAll();
    }, 120_000);

    afterAll(async () => {
        jest.restoreAllMocks();
        server?.close();
        if (pgPool) await pgPool.end();
    });

// ── GET /api/users/db ──────────────────────────────────────────────────
    describe("GET /api/users/db", () => {
        it("reports the database as reachable (healthcheck)", async () => {
            const r = await call("GET", "/api/users/db");
            expect(r.status).toBe(200);
            expect(r.body.db).toBe("ok");
        });
    });

    // ── POST /api/users/signup/request-otp ─────────────────────────────
    describe("POST /api/users/signup/request-otp", () => {
        it("accepts a new email and persists a hashed, unexpired OTP", async () => {
            const ip = uniqueIp();
            const email = `otp-${crypto.randomUUID()}@test.local`;
            const r = await call("POST", "/api/users/signup/request-otp", {
                body: { email, password: "password123" },
                ip,
            });
            expect(r.status).toBe(200);
            expect(r.body.message).toContain("Verification code");

            const rows = await pgPool.query(
                `SELECT otp_hash, expires_at, used FROM otp_verifications WHERE email = $1`,
                [email]
            );
            expect(rows.rowCount).toBe(1);
            const row = rows.rows[0];
            expect(row.otp_hash).not.toBe(FIXED_OTP); // never plaintext at rest
            expect(String(row.otp_hash)).toHaveLength(64); // sha256 hex
            expect(row.used).toBe(false);
            expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
        });

        it("returns the SAME response for an already-registered email and mints no new OTP (anti-enumeration)", async () => {
            const email = `dup-${crypto.randomUUID()}@test.local`;
            await seedUser(email);
            const before = await db.count("otp_verifications", "email = $1", [email]);

            const r = await call("POST", "/api/users/signup/request-otp", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(200);
            expect(r.body.message).toContain("Verification code");
            expect(await db.count("otp_verifications", "email = $1", [email])).toBe(before);
        });

        it("rejects an invalid email with a 400 field error", async () => {
            const r = await call("POST", "/api/users/signup/request-otp", {
                body: { email: "not-an-email", password: "password123" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors.some((e: any) => e.field === "email")).toBe(true);
        });

        it("rejects a short password with a 400 field error", async () => {
            const r = await call("POST", "/api/users/signup/request-otp", {
                body: { email: `short-${crypto.randomUUID()}@test.local`, password: "123" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors.some((e: any) => e.field === "password")).toBe(true);
        });
    });

// ── POST /api/users/signup/verify-otp ─────────────────────────────────
    describe("POST /api/users/signup/verify-otp", () => {
        it("creates the user, enqueues user.registered.v1 atomically and returns 201", async () => {
            const email = `vip-${crypto.randomUUID()}@test.local`;
            await call("POST", "/api/users/signup/request-otp", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            const r = await call("POST", "/api/users/signup/verify-otp", {
                body: { email, password: "password123", otp: FIXED_OTP, timezone: "Europe/Berlin" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(201);
            expect(r.body.user.email).toBe(email);
            expect(r.body.user.id).toBeTruthy();
            expect(JSON.stringify(r.body)).not.toContain("$2"); // no password hash anywhere

            const user = await db.findUserByEmail(email);
            expect(user.password).toMatch(/^\$2/); // bcrypt hash at rest

            const events = await db.findOutboxByEmail(email);
            expect(events).toHaveLength(1);
            const evt = events[0];
            expect(evt.event_type).toBe("user.registered.v1");
            expect(evt.published).toBe(false);
            expect(evt.payload.event_version).toBe(1);
            expect(evt.payload.payload.email).toBe(email);
            expect(evt.payload.payload.provider).toBe("email");
            expect(evt.payload.payload.timezone).toBe("Europe/Berlin");
            expect(await db.count("otp_verifications", "email = $1", [email])).toBe(0);
        });

        it("omits timezone from the event payload when not supplied", async () => {
            const email = `vtz-${crypto.randomUUID()}@test.local`;
            await call("POST", "/api/users/signup/request-otp", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            const r = await call("POST", "/api/users/signup/verify-otp", {
                body: { email, password: "password123", otp: FIXED_OTP },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(201);
            const events = await db.findOutboxByEmail(email);
            expect(events[0].payload.payload).not.toHaveProperty("timezone");
        });

        it("rejects a wrong OTP", async () => {
            const email = `vbad-${crypto.randomUUID()}@test.local`;
            await call("POST", "/api/users/signup/request-otp", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            const r = await call("POST", "/api/users/signup/verify-otp", {
                body: { email, password: "password123", otp: "999999" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].message).toContain("Invalid or expired");
        });

        it("rejects an expired OTP", async () => {
            const email = `vexp-${crypto.randomUUID()}@test.local`;
            const otp_hash = OtpModel.hash(FIXED_OTP);
            await pgPool.query(
                `INSERT INTO otp_verifications (email, otp_hash, expires_at, used)
                 VALUES ($1, $2, now() - interval '1 minute', false)`,
                [email, otp_hash]
            );
            const r = await call("POST", "/api/users/signup/verify-otp", {
                body: { email, password: "password123", otp: FIXED_OTP },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].message).toContain("Invalid or expired");
        });

        it("rolls back EVERYTHING when the email is already taken — no user, no outbox row (C2)", async () => {
            const email = `vrace-${crypto.randomUUID()}@test.local`;
            await seedUser(email);
            await call("POST", "/api/users/signup/request-otp", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            const r = await call("POST", "/api/users/signup/verify-otp", {
                body: { email, password: "password123", otp: FIXED_OTP },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].message).toContain("Email in use");
            expect(await db.findOutboxByEmail(email)).toHaveLength(0);
            expect(await db.count("lp_users", "email = $1", [email])).toBe(1); // seeded row only
        });
    });

// ── POST /api/users/signin ────────────────────────────────────────────
    describe("POST /api/users/signin", () => {
        it("returns a JWT in the minimal {id,email,created_at} shape — no password hash (C1)", async () => {
            const email = `s-${crypto.randomUUID()}@test.local`;
            const user = await seedUser(email, "password123");

            const r = await call("POST", "/api/users/signin", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(200);
            const claims = jwt.verify(r.body.token, process.env.JWT_KEY!) as any;
            expect(claims.id).toBe(user.id);
            expect(r.body.user).toEqual({
                id: user.id,
                email,
                created_at: expect.any(String),
            });
            expect(r.body.user).not.toHaveProperty("password");
            expect(JSON.stringify(r.body)).not.toContain("$2");
        });

        it("rejects a wrong password with the generic error", async () => {
            const email = `sw-${crypto.randomUUID()}@test.local`;
            await seedUser(email, "password123");
            const r = await call("POST", "/api/users/signin", {
                body: { email, password: "wrong-password" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].message).toBe("Invalid credentials");
        });

        it("returns the SAME generic error for an unknown email (anti-enumeration)", async () => {
            const r = await call("POST", "/api/users/signin", {
                body: { email: `nobody-${crypto.randomUUID()}@test.local`, password: "password123" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].message).toBe("Invalid credentials");
        });

        it("blocks signin for a tombstoned (deleted) user", async () => {
            const email = `del-${crypto.randomUUID()}@test.local`;
            const user = await seedUser(email, "password123");
            await pgPool.query(`INSERT INTO deleted_users (user_id, deleted_at) VALUES ($1, now())`, [user.id]);

            const r = await call("POST", "/api/users/signin", {
                body: { email, password: "password123" },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].message).toBe("Invalid credentials");
        });
    });

// ── POST /api/users/social-auth ───────────────────────────────────────
    describe("POST /api/users/social-auth", () => {
        beforeEach(() => {
            jest.mocked(googleValidator.validateGoogleAccessToken).mockReset();
            jest.mocked(facebookValidator.validateFacebookAccessToken).mockReset();
        });

        it("creates a new google user, issues a JWT and enqueues user.registered.v1", async () => {
            const providerEmail = `google-${crypto.randomUUID()}@test.local`;
            jest.mocked(googleValidator.validateGoogleAccessToken).mockResolvedValue({
                sub: `google-sub-${crypto.randomUUID()}`,
                email: providerEmail,
                email_verified: true,
                name: "Test User",
                picture: "https://example.com/pic.png",
            });

            const r = await call("POST", "/api/users/social-auth", {
                body: {
                    provider: "google",
                    access_token: "track-this-is-a-token",
                    profile: { id: "ignored-by-controller", email: providerEmail, name: "Test User" },
                },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(200);
            expect(r.body.token).toBeTruthy();
            expect(r.body.user.email).toBe(providerEmail);

            const events = await db.findOutboxByEmail(providerEmail);
            expect(events).toHaveLength(1);
            expect(events[0].event_type).toBe("user.registered.v1");
            expect(events[0].payload.payload.provider).toBe("google");
        });

        it("signs in an existing provider user without duplicating the account", async () => {
            const providerEmail = `google2-${crypto.randomUUID()}@test.local`;
            const sub = `google-sub-${crypto.randomUUID()}`;
            const hash = await Password.toHash("unused-social-password");
            const created = await pgPool.query(
                `INSERT INTO lp_users (email, password, provider, provider_user_id)
                 VALUES ($1, $2, 'google', $3) RETURNING id, email, created_at`,
                [providerEmail, hash, sub]
            );
            jest.mocked(googleValidator.validateGoogleAccessToken).mockResolvedValue({
                sub,
                email: providerEmail,
                email_verified: true,
                name: "G",
            });

            const r = await call("POST", "/api/users/social-auth", {
                body: {
                    provider: "google",
                    access_token: "tok-abcdefghij",
                    profile: { id: "x", email: providerEmail, name: "G" },
                },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(200);
            expect(r.body.user.id).toBe(created.rows[0].id);
            expect(await db.count("lp_users", "email = $1", [providerEmail])).toBe(1);
        });

        it("rejects an unverified google email", async () => {
            jest.mocked(googleValidator.validateGoogleAccessToken).mockResolvedValue({
                sub: "sub-unverified",
                email: `uv-${crypto.randomUUID()}@test.local`,
                email_verified: false,
            });
            const r = await call("POST", "/api/users/social-auth", {
                body: { provider: "google", access_token: "tok-abcdefghij", profile: { id: "x" } },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
        });

        it("rejects an unsupported provider", async () => {
            const r = await call("POST", "/api/users/social-auth", {
                body: { provider: "apple", access_token: "tok-abcdefghij", profile: { id: "x" } },
                ip: uniqueIp(),
            });
            expect(r.status).toBe(400);
        });
    });

// ── PUT /api/users/profile/reset-password ─────────────────────────────
    describe("PUT /api/users/profile/reset-password", () => {
        it("changes the password for the authenticated user", async () => {
            const email = `rp-${crypto.randomUUID()}@test.local`;
            const user = await seedUser(email, "old-password");
            const token = tokenFor(user);

            const r = await call("PUT", "/api/users/profile/reset-password", {
                body: { password: "new-password" },
                token,
            });
            expect(r.status).toBe(200);

            const oldSignin = await call("POST", "/api/users/signin", {
                body: { email, password: "old-password" },
                ip: uniqueIp(),
            });
            expect(oldSignin.status).toBe(400);

            const newSignin = await call("POST", "/api/users/signin", {
                body: { email, password: "new-password" },
                ip: uniqueIp(),
            });
            expect(newSignin.status).toBe(200);
        });

        it("rejects requests without a token (401)", async () => {
            const r = await call("PUT", "/api/users/profile/reset-password", {
                body: { password: "new-password" },
            });
            expect(r.status).toBe(401);
        });

        it("rejects a tampered token (401)", async () => {
            const r = await call("PUT", "/api/users/profile/reset-password", {
                body: { password: "new-password" },
                token: "not-a-real-token",
            });
            expect(r.status).toBe(401);
        });

        it("rejects a short password (400)", async () => {
            const email = `rps-${crypto.randomUUID()}@test.local`;
            const user = await seedUser(email, "password123");
            const r = await call("PUT", "/api/users/profile/reset-password", {
                body: { password: "123" },
                token: tokenFor(user),
            });
            expect(r.status).toBe(400);
            expect(r.body.errors.some((e: any) => e.field === "password")).toBe(true);
        });
    });

    // ── POST /api/users/delete ─────────────────────────────────────────
    describe("POST /api/users/delete", () => {
        it("deletes the user, writes a tombstone and enqueues user.deleted.v1", async () => {
            const email = `delacc-${crypto.randomUUID()}@test.local`;
            const user = await seedUser(email, "password123");
            const token = tokenFor(user);

            const r = await call("POST", "/api/users/delete", { token });
            expect(r.status).toBe(200);
            expect(r.body.user).toBeNull();

            expect(await db.count("lp_users", "id = $1", [user.id])).toBe(0);
            expect(await db.count("deleted_users", "user_id = $1", [user.id])).toBe(1);

            const delEvents = await pgPool.query(
                `SELECT * FROM outbox_events WHERE event_type = 'user.deleted.v1' AND aggregate_id = $1`,
                [user.id]
            );
            expect(delEvents.rowCount).toBe(1);
            expect(delEvents.rows[0].payload.payload.deleted_by).toBe("user");
        });

        it("rejects requests without a token (401)", async () => {
            const r = await call("POST", "/api/users/delete");
            expect(r.status).toBe(401);
        });

        it("returns 400 when the user no longer exists (idempotent second delete)", async () => {
            const email = `del2-${crypto.randomUUID()}@test.local`;
            const user = await seedUser(email, "password123");
            const token = tokenFor(user);

            expect((await call("POST", "/api/users/delete", { token })).status).toBe(200);
            const again = await call("POST", "/api/users/delete", { token });
            expect(again.status).toBe(400);
        });
    });

// ── POST /api/users/signout ───────────────────────────────────────────
    describe("POST /api/users/signout", () => {
        it("returns 200 (stateless JWT — signout is client-side token discard)", async () => {
            const r = await call("POST", "/api/users/signout");
            expect(r.status).toBe(200);
        });
    });

    // ── 404 / error contract ───────────────────────────────────────────
    describe("404 & error contract", () => {
        it("returns a JSON 404 for unknown routes (not Express HTML)", async () => {
            const r = await call("GET", "/api/users/definitely-not-a-route");
            expect(r.status).toBe(404);
            expect(r.body.errors[0].message).toContain("Route not found");
        });

        it("returns 400 for a malformed JSON body", async () => {
            const res = await fetch(`${base}/api/users/signin`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Forwarded-For": uniqueIp() },
                body: "{ not json",
            });
            expect(res.status).toBe(400);
        });
    });

    // ── Rate limiting ──────────────────────────────────────────────────
    describe("rate limiting (per client IP via X-Forwarded-For)", () => {
        it("returns 429 after the 10th signin attempt from the same IP", async () => {
            const ip = uniqueIp();
            const email = `rl-${crypto.randomUUID()}@test.local`;
            await seedUser(email, "password123");

            for (let i = 0; i < 10; i++) {
                const r = await call("POST", "/api/users/signin", {
                    body: { email, password: "WRONG" },
                    ip,
                });
                expect(r.status).toBe(400);
            }
            const blocked = await call("POST", "/api/users/signin", {
                body: { email, password: "WRONG" },
                ip,
            });
            expect(blocked.status).toBe(429);
            expect(blocked.body.errors[0].message).toContain("Too many signin attempts");
        });
    });

    // ── CORS ───────────────────────────────────────────────────────────
    describe("CORS", () => {
        it("serves requests from an allowed origin with reflect headers", async () => {
            const res = await fetch(`${base}/api/users/db`, {
                headers: { Origin: "https://play.google.com" },
            });
            expect(res.status).toBe(200);
            expect(res.headers.get("access-control-allow-origin")).toBe("https://play.google.com");
        });
    });
});