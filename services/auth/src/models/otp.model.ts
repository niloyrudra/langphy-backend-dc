import { pgPool } from "../db/index.js";
import crypto from "crypto";

export class OtpModel {
    static generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
    }

    static hash( otp: string ) : string {
        return crypto.createHash("sha256").update(otp).digest("hex");
    }

    static async upsert( email: string, otp: string ): Promise<void> {
        const otp_hash = this.hash( otp );
        const expires_at = new Date( Date.now() + 10 * 60 * 1000 ); // OTP valid for 10 minutes

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

    static async verify( email: string, otp: string ): Promise<boolean> {
        const otp_hash = this.hash( otp );

        try {
            const result = await pgPool.query(
                `SELECT * FROM otp_verifications
                 WHERE email = $1
                   AND otp_hash = $2
                   AND used = false
                   AND expires_at > now()`,
                [email, otp_hash]
            );
            if (result.rowCount === 0) return false;
    
            // Mark OTP as used
            await pgPool.query(
                `UPDATE otp_verifications
                 SET used = true
                 WHERE email = $1 AND otp_hash = $2`,
                [email, otp_hash]
            );
    
            return true;
        }
        catch(error: any) {
            console.error("Error verifying OTP:", error);
            return false;
        }

    }

    static async cleanupExpiredOtps(): Promise<void> {
        await pgPool.query(
            `DELETE FROM otp_verifications
             WHERE expires_at < now() OR used = true`
        );
    }

    static async cleanup( email: string ): Promise<void> {
        await pgPool.query(
            `DELETE FROM otp_verifications
             WHERE email = $1`,
            [email]
        );
    }
}