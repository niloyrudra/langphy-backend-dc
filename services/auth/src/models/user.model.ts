import { pgPool } from "../db/index.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { Password } from "../services/password.js";

export interface User {
    id: string;
    email: string;
    password: string;
    provider: string;
    created_at: Date;
    updated_at: Date | null;
}

export type PublicUser = Omit<User, "password">;

const USER_COLUMNS = "id, email, password, provider, created_at, updated_at";

export class UserModel {
    static async findByEmail(email: string): Promise<User | null> {
        const result = await pgPool.query<User>(
            `SELECT ${USER_COLUMNS} FROM lp_users WHERE email = $1`,
            [email]
        );
        if (result.rowCount === 0) return null;
        return result.rows[0];
    }

    /**
     * Create a user. On unique-email violation, raises BadRequestError so the
     * controller can return a 400. Other DB errors bubble to the global
     * error handler.
     */
    static async create(email: string, password: string, provider: string): Promise<User> {
        const hashedPassword = await Password.toHash(password);

        try {
            const result = await pgPool.query<User>(
                `INSERT INTO lp_users (email, password, provider)
                 VALUES ($1, $2, $3)
                 RETURNING ${USER_COLUMNS}`,
                [email, hashedPassword, provider]
            );
            return result.rows[0];
        } catch (err: any) {
            if (err?.code === "23505") {
                // unique_violation
                throw new BadRequestError("Email in use");
            }
            throw err;
        }
    }

    static async resetPasswordByEmail(email: string, newPassword: string): Promise<PublicUser> {
        const hashedPassword = await Password.toHash(newPassword);

        const result = await pgPool.query<PublicUser>(
            `UPDATE lp_users
             SET password = $1
             WHERE email = $2
             RETURNING id, email, provider, created_at`,
            [hashedPassword, email]
        );

        if (result.rowCount === 0) {
            throw new BadRequestError("User not found!");
        }
        return result.rows[0];
    }

    static async resetPasswordByUserId(userId: string, newPassword: string): Promise<PublicUser> {
        const hashedPassword = await Password.toHash(newPassword);

        const result = await pgPool.query<PublicUser>(
            `UPDATE lp_users
             SET password = $1
             WHERE id = $2
             RETURNING id, email, provider, created_at`,
            [hashedPassword, userId]
        );

        if (result.rowCount === 0) {
            throw new BadRequestError("User not found!");
        }
        return result.rows[0];
    }

    /**
     * Hard delete a user. The deleted_users tombstone is written by
     * DeletedUsersRepo.softDeleteWithOutbox in the same transaction —
     * do not call this directly from controllers anymore.
     */
    static async delete(userId: string): Promise<PublicUser> {
        const result = await pgPool.query<PublicUser>(
            `DELETE FROM lp_users WHERE id = $1 RETURNING id`,
            [userId]
        );
        if (result.rowCount === 0) {
            throw new BadRequestError("Account Deletion failed!");
        }
        return result.rows[0];
    }
}