import crypto from "crypto";
import { pgPool } from "../db/index.js";
import type { Pool, PoolClient } from "pg";

/**
 * Either the shared pool (autocommit) or a caller-owned transaction client.
 */
type DbExecutor = Pool | PoolClient;

/**
 * OTP storage and verification.
 *
 * - `generateOtp` uses crypto.randomInt — cryptographically secure, uniform
 *   distribution across all 6-digit codes.
 * - `verify` is a single atomic UPDATE … RETURNING statement. No SELECT/UPDATE
 *   pair, so two parallel requests with the same OTP cannot both succeed —
 *   Postgres takes a row lock on the matching row and only one UPDATE wins.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;
const OTP_MIN = 100_000;
const OTP_MAX = 1_000_000;

export class OtpModel {
    /**
     * Generate a cryptographically secure 6-digit numeric OTP, zero-padded.
     * Uses `crypto.randomInt` (uniform distribution) — NOT Math.random,
     * which is not safe for security purposes.
     */
    static generateOtp(): string {
        const n = crypto.randomInt(OTP_MIN, OTP_MAX);
        return n.toString().padStart(OTP_LENGTH, "0");
    }

    /** SHA-256 hash the OTP so we never store the plaintext at rest. */
    static hash(otp: string): string {
        return crypto.createHash("sha256").update(otp).digest("hex");
    }

    /**
     * Upsert a pending OTP for the given email. Replaces any existing
     * unverified OTP — so a user who requests a resend gets a fresh code.
     */
    static async upsert(email: string, otp: string): Promise<void> {
        const otp_hash = this.hash(otp);
        const expires_at = new Date(Date.now() + OTP_TTL_MS);

        await pgPool.query(
            `INSERT INTO otp_verifications (email, otp_hash, expires_at, used)
             VALUES ($1, $2, $3, false)
             ON CONFLICT (email) DO UPDATE SET
                otp_hash = EXCLUDED.otp_hash,
                expires_at = EXCLUDED.expires_at,
                used = false,
                created_at = now()`,
            [email, otp_hash, expires_at]
        );
    }

    /**
     * Atomic OTP verify + mark-used. Returns true iff the OTP was valid,
     * unused, and unexpired. The single UPDATE…RETURNING statement makes
     * parallel reuse impossible — Postgres row locks ensure only one
     * concurrent call wins.
     *
     * Pool version (autocommit). For verification INSIDE a larger
     * transaction use verifyInTx() so an invalid code doesn't leave a
     * half-committed signup.
     */
    static async verify(email: string, otp: string): Promise<boolean> {
        return OtpModel.verifyWithExec(pgPool, email, otp);
    }

    /**
     * Same as verify() but runs on the caller's transaction client so the
     * "OTP consumed" side effect commits atomically with the user INSERT.
     */
    static async verifyInTx(client: PoolClient, email: string, otp: string): Promise<boolean> {
        return OtpModel.verifyWithExec(client, email, otp);
    }

    private static async verifyWithExec(
        exec: DbExecutor,
        email: string,
        otp: string
    ): Promise<boolean> {
        const otp_hash = this.hash(otp);

        const result = await exec.query(
            `UPDATE otp_verifications
             SET used = true
             WHERE email = $1
               AND otp_hash = $2
               AND used = false
               AND expires_at > now()
             RETURNING email`,
            [email, otp_hash]
        );

        return result.rowCount === 1;
    }

    /** Best-effort cleanup of expired or consumed OTPs. Called by a cron (future). */
    static async cleanupExpiredOtps(): Promise<void> {
        await pgPool.query(
            `DELETE FROM otp_verifications
             WHERE expires_at < now() OR used = true`
        );
    }

    /** Cleanup a specific email's OTP row after successful signup. */
    static async cleanup(email: string): Promise<void> {
        await OtpModel.cleanupWithExec(pgPool, email);
    }

    /** Same as cleanup() but on the caller's transaction client. */
    static async cleanupInTx(client: PoolClient, email: string): Promise<void> {
        await OtpModel.cleanupWithExec(client, email);
    }

    private static async cleanupWithExec(exec: DbExecutor, email: string): Promise<void> {
        await exec.query(
            `DELETE FROM otp_verifications
             WHERE email = $1`,
            [email]
        );
    }
}