import { Router } from "express";
import { body, param } from "express-validator";
import {
    getDailySetController,
    startSessionController,
    submitAnswerController,
    completeSessionController,
    getProfileController,
    getLeaderboardController,
    getWeeklyLeaderboardController,
    getAchievementsController,
} from "../controllers/vocab-arena.controller.js";
import { validateAuth } from "../middlewares/validate-auth.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/vocab-arena/daily-set
 * Get today's words for practice
 */
router.get("/daily-set", getDailySetController);

/**
 * POST /api/vocab-arena/session/start
 * Start a new practice session
 */
router.post(
    "/session/start",
    [
        body("mode").isIn(["flashcard", "typing", "audio", "mixed"]),
        body("words").isArray({ min: 1 }),
    ],
    validateAuth,
    startSessionController
);

/**
 * POST /api/vocab-arena/session/:id/answer
 * Submit an answer for a word
 */
router.post(
    "/session/:id/answer",
    [
        param("id").isUUID(),
        body("lemma").isString().notEmpty(),
        body("grade").isInt({ min: 0, max: 5 }),
        body("responseTimeMs").optional().isInt({ min: 0 }),
    ],
    validateAuth,
    submitAnswerController
);

/**
 * POST /api/vocab-arena/session/:id/complete
 * Complete a session
 */
router.post(
    "/session/:id/complete",
    [
        param("id").isUUID(),
        body("mode").isIn(["flashcard", "typing", "audio", "mixed"]),
        body("wordsTotal").isInt({ min: 1 }),
        body("wordsCorrect").isInt({ min: 0 }),
        body("durationMs").isInt({ min: 0 }),
        body("xpEarned").isInt({ min: 0 }),
        body("newWordsLearned").isInt({ min: 0 }),
    ],
    validateAuth,
    completeSessionController
);

/**
 * GET /api/vocab-arena/profile
 * Get user's game profile and achievements
 */
router.get("/profile", getProfileController);

/**
 * GET /api/vocab-arena/leaderboard
 * Get global leaderboard
 */
router.get("/leaderboard", getLeaderboardController);

/**
 * GET /api/vocab-arena/leaderboard/weekly
 * Get weekly leaderboard
 */
router.get("/leaderboard/weekly", getWeeklyLeaderboardController);

/**
 * GET /api/vocab-arena/achievements
 * Get all achievements with unlock status
 */
router.get("/achievements", getAchievementsController);

export const vocabArenaRouter = router;