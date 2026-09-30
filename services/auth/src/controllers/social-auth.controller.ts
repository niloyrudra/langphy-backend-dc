import type { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";
import { OutboxRepo } from "../repos/outbox.repo.js";
import { pgPool } from "../db/index.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { randomBytes } from "crypto";
import { validateGoogleAccessToken } from "../services/google.validator.js";
import { validateFacebookAccessToken } from "../services/facebook.validator.js";
import type { PoolClient } from "pg";

interface SocialAuthBody {
    provider: "google" | "facebook";
    access_token: string;
    profile: {
        id: string;
        email: string | null;
        name: string | null;
        picture: string | null;
    };
}

export const socialAuthController = async (req: Request, res: Response) => {
    const { provider, access_token, profile } = req.body as SocialAuthBody;

    if (!provider || !["google", "facebook"].includes(provider)) {
        throw new BadRequestError("Unsupported provider.");
    }
    if (provider === "google" && !process.env.GOOGLE_WEB_CLIENT_ID) {
        throw new BadRequestError("Sign in with google is not available right now.");
    }
    if (provider === "facebook" && (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET)) {
        throw new BadRequestError("Sign in with facebook is not available right now.");
    }
    if (!access_token || typeof access_token !== "string") {
        throw new BadRequestError("Missing access token.");
    }
    if (!profile?.id) {
        throw new BadRequestError("Invalid provider profile.");
    }

    let providerUserId: string;
    let providerEmail: string;
    let providerName: string | null;
    let providerPicture: string | null;

    if (provider === "google") {
        const v = await validateGoogleAccessToken(access_token);
        providerUserId = v.sub;
        if (!v.email_verified) {
            throw new BadRequestError("Email not verified by provider.");
        }
        providerEmail = v.email;
        providerName = v.name ?? null;
        providerPicture = v.picture ?? null;
    } else {
        const v = await validateFacebookAccessToken(access_token);
        providerUserId = v.user_id;
        providerEmail = v.email;
        providerName = v.name ?? null;
        providerPicture = v.picture ?? null;
    }

    if (!providerEmail) {
        throw new BadRequestError("Email permission required. Please grant access to your email.");
    }

    const byProvider = await UserModel.findByProvider(provider, providerUserId);
    if (byProvider) {
        const token = jwt.sign(
            {
                id: byProvider.id,
                email: byProvider.email,
                created_at: byProvider.created_at,
            },
            process.env.JWT_KEY!,
            { expiresIn: "1h" }
        );
        res.status(200).json({
            token,
            message: `Signed in with ${provider}`,
            user: { id: byProvider.id, email: byProvider.email, created_at: byProvider.created_at },
        });
        return;
    }

    const byEmail = await UserModel.findByEmail(providerEmail);
    if (byEmail && byEmail.provider !== provider) {
        throw new BadRequestError(
            `This email is registered with ${byEmail.provider}. Please sign in with your password, then link your account from Settings.`
        );
    }

    const client: PoolClient = await pgPool.connect();
    try {
        await client.query("BEGIN");

        const race = await client.query(
            `SELECT id, provider FROM lp_users WHERE email = $1`,
            [providerEmail]
        );
        if (race.rowCount && race.rowCount > 0) {
            const row = race.rows[0];
            if (row.provider !== provider) {
                await client.query("ROLLBACK");
                throw new BadRequestError(
                    `This email is registered with ${row.provider}. Please sign in with your password.`
                );
            }
            await client.query("ROLLBACK");
            const existing = await UserModel.findByProvider(provider, providerUserId);
            if (existing) {
                const token = jwt.sign(
                    {
                        id: existing.id,
                        email: existing.email,
                        created_at: existing.created_at,
                    },
                    process.env.JWT_KEY!,
                    { expiresIn: "1h" }
                );
                res.status(200).json({ token, message: `Signed in with ${provider}`, user: { id: existing.id, email: existing.email, created_at: existing.created_at } });
                return;
            }
            throw new BadRequestError("Sign in conflict. Please try again.");
        }

        const syntheticPassword = randomBytes(48).toString("hex");
        const hashedPassword = await (await import("../services/password.js")).Password.toHash(syntheticPassword);
        const newUser = await UserModel.createSocial(
            client,
            providerEmail,
            provider,
            providerUserId,
            hashedPassword,
        );

        const eventId = crypto.randomUUID();
        await OutboxRepo.enqueue(client, {
            event_id: eventId,
            event_type: "user.registered.v1",
            event_version: 1,
            occurred_at: new Date(),
            user_id: newUser.id,
            payload: {
                email: providerEmail,
                provider,
                name: providerName,
            },
        });

        await client.query("COMMIT");

        const token = jwt.sign(
            {
                id: newUser.id,
                email: newUser.email,
                created_at: newUser.created_at,
            },
            process.env.JWT_KEY!,
            { expiresIn: "1h" }
        );

        res.status(200).json({
            token,
            message: `Account created with ${provider}`,
            user: { id: newUser.id, email: newUser.email, created_at: newUser.created_at },
        });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
};