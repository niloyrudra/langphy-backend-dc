import { Router } from "express";
import { body } from "express-validator";
import {
    registerDeviceToken,
    deregisterDeviceToken,
    deleteDeviceToken,
} from "../controllers/device.controller.js";
import { getNotification } from "../controllers/notifications.controller.js";
import { errorHandler } from "../middlewares/error-handler.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

// ── Client routes (authenticated) ────────────────────────────────────────────

// Get my notifications
router.get(
    "/api/notification",
    requireAuth,
    errorHandler,
    getNotification
);

// Register (upsert) a device token — called on every launch when notifications enabled
router.post(
    "/api/notification/devices/register",
    requireAuth,
    [
        body("platform").notEmpty().withMessage("platform is required"),
        body("token").notEmpty().withMessage("token is required"),
    ],
    errorHandler,
    registerDeviceToken
);

/**
 * Deregister a device token — called when the user disables notifications
 * in their in-app settings. Removes the token from lp_device_tokens so the
 * user stops receiving pushes immediately, without waiting for a server-side
 * cleanup cycle.
 *
 * Uses the authenticated user's ID as a second filter so a user can never
 * accidentally (or maliciously) remove another user's token.
 *
 * Route: POST /api/notification/devices/deregister
 * Body: { token: string }
 */
router.post(
    "/api/notification/devices/deregister",
    requireAuth,
    [
        body("token").notEmpty().withMessage("token is required"),
    ],
    errorHandler,
    deregisterDeviceToken
);

// Hard-delete a token by value (internal/admin use — no auth scope check)
router.post(
    "/api/notification/devices/delete",
    requireAuth,
    [
        body("token").notEmpty(),
    ],
    errorHandler,
    deleteDeviceToken
);

export { router as NotificationRouter };