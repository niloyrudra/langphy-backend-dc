import type { Response } from "express";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { DeviceTokenModel } from "../models/device-token.model.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

// ── Register ──────────────────────────────────────────────────────────────────

/**
 * Upsert a device token for the authenticated user.
 * Called on every app launch when notifications are enabled.
 * Handles new APK installs that generate a new FCM/Expo token.
 */
export const registerDeviceToken = async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    try {
        const userId = req.user?.id;
        const { platform, token } = req.body;
        if (!userId || !platform || !token) throw new BadRequestError("Missing required param(s)!");

        await DeviceTokenModel.upsertToken(userId, token, platform);
        res.status(204).send();
    } catch (error) {
        console.error("[registerDeviceToken] error:", error);
        throw error;
    }
};

// ── Deregister ────────────────────────────────────────────────────────────────

/**
 * Remove a specific device token for the authenticated user.
 *
 * Called when the user disables notifications in their in-app settings.
 * Scopes the delete to BOTH token AND user_id so:
 *   - A user cannot remove another user's token by guessing it.
 *   - If the same physical device is shared between accounts (edge case),
 *     only the calling user's token row is removed.
 *
 * Returns 204 whether or not the token existed — deregister is idempotent.
 */
export const deregisterDeviceToken = async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    try {
        const userId = req.user?.id;
        const { token } = req.body;
        if (!userId || !token) throw new BadRequestError("Missing required param(s)!");

        await DeviceTokenModel.deleteTokenForUser(userId, token);
        res.status(204).send();
    } catch (error) {
        console.error("[deregisterDeviceToken] error:", error);
        throw error;
    }
};

// ── Hard delete (internal) ────────────────────────────────────────────────────

/**
 * Delete a token by value alone — used internally when Expo/FCM reports
 * a token as DeviceNotRegistered, and for account deletion cleanup.
 * Not scoped to the calling user's ID because it's also called from
 * server-side cleanup flows where no auth context is available.
 */
export const deleteDeviceToken = async (req: AuthRequest, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) throw new BadRequestError("token is required");

        await DeviceTokenModel.deleteToken(token);
        res.status(200).json({ message: "Device token deleted." });
    } catch (error) {
        console.error("[deleteDeviceToken] error:", error);
        throw error;
    }
};