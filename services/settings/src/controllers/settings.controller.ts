import type { Response, NextFunction } from "express";
import { SettingsModel } from "../models/settings.model.js";
import { body, validationResult } from "express-validator";
import type { AuthRequest } from "../middlewares/require-auth.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";

export const validateUpdateSettings = [
    body("theme").optional().isIn(["light", "dark"]),
    body("language").optional().isString(),
    body("notifications").optional().isBoolean(),
    body("sound_effect").optional().isBoolean(),
    body("speaking_service").optional().isBoolean(),
    body("practice_service").optional().isBoolean(),
    body("reading_service").optional().isBoolean(),
    body("listening_service").optional().isBoolean(),
    body("writing_service").optional().isBoolean(),
    body("quiz_service").optional().isBoolean(),
    body("updated_at").optional().isISO8601().toDate(),
];

export const getSettingsController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("userId is required");

        const settings = await SettingsModel.getSettings(userId as string);
        if (!settings) return res.status(404).json({ message: "Settings not found" });

        res.status(200).json({ message: "Settings fetched successfully", settings });
    } catch (err) {
        console.error("Get settings error:", err);
        next(err);
    }
};

export const updateSettingsController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("userId is required");

        const settings = await SettingsModel.updateSettings(userId as string, req.body);
        res.status(200).json({ message: "Settings updated successfully", settings });
    } catch (err) {
        console.error("Update settings error:", err);
        next(err);
    }
};