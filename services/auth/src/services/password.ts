import bcrypt from "bcrypt";

/**
 * Password hashing.
 *
 * - Cost 12 is current OWASP guidance for 2024-2026 hardware. Cost 10
 *   was the previous default; cost 12 doubles the work factor and is
 *   the right ceiling until bcrypt's 72-byte limit forces a migration
 *   to scrypt or Argon2id.
 * - Plaintext is never logged. Inputs are passed straight through to
 *   bcrypt; the comparison helper short-circuits when either side is
 *   missing so callers don't accidentally feed `undefined` to bcrypt.
 */
const BCRYPT_COST = 12;

export class Password {
    static async toHash(password: string): Promise<string> {
        if (!password) {
            throw new Error("password is required");
        }
        return await bcrypt.hash(password, BCRYPT_COST);
    }

    static async compare(storedHash: string, suppliedPassword: string): Promise<boolean> {
        if (!suppliedPassword || !storedHash) {
            throw new Error("Password or hash missing");
        }
        return await bcrypt.compare(suppliedPassword, storedHash);
    }
}