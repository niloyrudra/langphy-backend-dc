import { Resend } from "resend";

let resend: Resend | null = null;

/**
 * Lazily construct the Resend client on the first send.
 *
 * The Resend constructor THROWS when no API key is available. Constructing
 * it at module load (as before) crashed the whole service at boot whenever
 * RESEND_API_KEY was missing — even though env validation treats the key as
 * optional. Moving construction to send-time means a missing key now
 * surfaces as a failed (caught + logged) email instead of a dead process.
 *
 * See src/config/env.ts for the warning-level treatment of RESEND_API_KEY.
 */
function getResendClient(): Resend {
    if (!resend) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

/**
 * Sender address.
 * - Default: `onboarding@resend.dev` — Resend's built-in test sender. It
 *   needs NO verified domain, so it works out of the box locally (delivery
 *   is limited to your own inbox).
 * - Production: set `FROM_EMAIL` to a verified domain, e.g.
 *   `Langphy <no-reply@langphy.com>`. Until the domain is verified in the
 *   Resend dashboard, Resend rejects every send with 400.
 */
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
    console.log(`Sending OTP email to ${email} with code ${otp}`);
    const result: any = await getResendClient().emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "Your Langphy verification code",
        html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
                <h2>Verify your email</h2>
                <p>Your verification code is:</p>
                <h1 style="letter-spacing: 8px; font-size: 40px; color: #1B7CF5;">${otp}</h1>
                <p style="color: #666;">This code expires in 10 minutes.</p>
                <p style="color: #666;">If you didn't request this, ignore this email.</p>
            </div>
        `,
    });

    // The Resend SDK returns API errors as `{ error: ... }` VALUES instead of
    // throwing them. Without this check, a rejected send (e.g. unverified
    // sender domain) would be silently swallowed and we'd never know why a
    // user "didn't receive" their code. Log it so the failure is visible in
    // `docker logs` — the request-otp endpoint intentionally returns the same
    // response either way (anti-enumeration).
    if (result?.error) {
        console.error("[email] Resend rejected OTP send:", result.error);
    }
};