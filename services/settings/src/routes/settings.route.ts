import { Router } from "express";
import {
    getSettingsController,
    updateSettingsController,
    validateUpdateSettings,
} from "../controllers/settings.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

router.get("/api/settings", requireAuth, getSettingsController);
router.put("/api/settings", requireAuth, validateUpdateSettings, updateSettingsController);

export { router as SettingsRouter };