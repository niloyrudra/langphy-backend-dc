import { Router } from "express";
import { body } from "express-validator";
import {
    registerDeviceToken,
    deleteDeviceToken,
} from "../controllers/device.controller.js";
import {
    getNotification,
} from "../controllers/notifications.controller.js";
import { errorHandler } from "../middlewares/error-handler.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

/**
 * CLIENT ROUTES (Authenticated)
 */

// Get my notifications
router.get(
    "/api/notification",
    requireAuth,
    errorHandler,
    getNotification
);

// Register device token
router.post(
    "/api/notification/devices/register",
    requireAuth,
    [
        body("platform").notEmpty(),
        body("token").notEmpty()
    ],
    errorHandler,
    registerDeviceToken
);

// Delete device token
router.post(
    "/api/notification/devices/delete",
    requireAuth,
    [
        body("token").notEmpty()
    ],
    errorHandler,
    deleteDeviceToken
);

export { router as NotificationRouter };