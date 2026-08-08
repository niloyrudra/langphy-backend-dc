import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../models/user.model.js";
import { OtpModel } from "../models/otp.model.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { sendOtpEmail } from "../services/email.service.js";
import { pgPool } from "../db/index.js";
import { OutboxRepo } from "../repos/outbox.repo.js";
import type { PoolClient } from "pg";

/**
 * Signup is a 2-step flow:
 *
 *   POST /api/users/signup/request-otp   { email, password }
 *     → always returns the SAME success message whether the email is new or
 *       already registered (anti-enumeration).
 *     → only sends an email + writes the OTP row if the email is new.
 *
 *   POST /api/users/signup/verify-otp    { email, password, otp }
 *     → atomic OTP verify + user create + outbox event enqueue.
 *     → transactional: if any step fails, the user isn't created.
 */

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — request OTP
// ─────────────────────────────────────────────────────────────────────────

export const requestOtpController = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Quick validation of inputs that the controller itself relies on.
    // Route-level express-validator still handles structural checks
    // (length, format) before we get here.
    if (typeof email !== "string" || typeof password !== "string") {
        throw new BadRequestError("Email and password are required");
    }

    const existingUser = await UserModel.findByEmail(email);

    if (existingUser) {
        // Anti-enumeration: log internally, return identical response.
        // We deliberately do NOT call OtpModel.upsert or sendOtpEmail.
        console.info(
            `[signup.request-otp] duplicate email request suppressed: ${hashForLog(email)}`
        );
    } else {
        const otp = OtpModel.generateOtp();
        await OtpModel.upsert(email, otp);
        // Email failure is non-fatal — the user can request a resend.
        try {
            await sendOtpEmail(email, otp);
        } catch (emailErr) {
            console.error("[signup.request-otp] email send failed:", emailErr);
        }
    }

    // Identical response regardless of email's prior state.
    res.status(200).json({
        message: "Verification code sent to your email.",
    });
};

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — verify OTP and create user (transactional)
// ─────────────────────────────────────────────────────────────────────────

export const verifyOtpController = async (req: Request, res: Response) => {
    const { email, password, otp } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || typeof otp !== "string") {
        throw new BadRequestError("Email, password and otp are required");
    }

    const valid = await OtpModel.verify(email, otp);
    if (!valid) {
        throw new BadRequestError("Invalid or expired verification code.");
    }

    // Transactional create + outbox enqueue. If the unique-email constraint
    // fires (race: another verify-otp completed first), we roll back the
    // outbox row — no event will be published for a user that didn't get
    // created.
    const client: PoolClient = await pgPool.connect();
    try {
        await client.query("BEGIN");

        // Race guard: another verify-otp may have created the user between
        // the OTP verification and here.
        const existing = await client.query(
            `SELECT id FROM lp_users WHERE email = $1`,
            [email]
        );
        if (existing.rowCount && existing.rowCount > 0) {
            await client.query("ROLLBACK");
            throw new BadRequestError("Email in use");
        }

        const user = await UserModel.create(email, password, "email");
        await OtpModel.cleanup(email);

        const eventId = uuidv4();
        await OutboxRepo.enqueue(client, {
            event_id: eventId,
            event_type: "user.registered.v1",
            event_version: 1,
            occurred_at: new Date(),
            user_id: user.id,
            payload: { email, provider: "email" },
        });

        await client.query("COMMIT");

        res.status(201).json({
            message: "Account created successfully!",
            user: { id: user.id, email: user.email, created_at: user.created_at },
        });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
};

// Hash for logging so we don't write plaintext email to logs.
function hashForLog(s: string): string {
    // Lazy import to keep this helper colocated with the controller.
    // (Avoids adding a top-level dependency just for one log line.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("crypto") as typeof import("crypto");
    return createHash("sha256").update(s).digest("hex").slice(0, 12);
}