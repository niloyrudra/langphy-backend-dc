import { Router } from "express";
import {
    getStreakController,
    createStreakController,
    updateStreakController
} from "../controllers/streaks.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { errorHandler } from "../middlewares/error-handler.js";

const router = Router();

router.get(
    "/api/streaks",
    requireAuth,
    errorHandler,
    getStreakController
);

router.post(
    "/api/streaks",
    requireAuth,
    errorHandler,
    createStreakController
);

router.put(
    "/api/streaks",
    requireAuth,
    errorHandler,
    updateStreakController
);

export { router as StreaksRouter };