import { Router } from "express";
import { getStreakController } from "../controllers/streaks.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

/**
 * GET /api/streaks — return the authenticated user's streak read-model.
 *
 * Writes are deliberately NOT exposed here. The consumer is the only
 * legitimate write path; POST/PUT endpoints would let a client self-bump
 * their own streak.
 */
router.get("/api/streaks", requireAuth, getStreakController);

export { router as StreaksRouter };