import { Router } from "express";
import { body } from "express-validator";
import {
    syncVocabularyController,
    getVocabularyCountController,
} from "../controllers/vocabulary.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { errorHandler } from "../middlewares/error-handler.js";

const router = Router();

// Bulk sync dirty vocabulary words from the app
router.post(
    "/api/vocabulary/sync",
    requireAuth,
    [
        body("words").isArray({ min: 1 }).withMessage("words must be a non-empty array"),
        body("words.*.word").notEmpty().withMessage("word is required"),
        body("words.*.lemma").notEmpty().withMessage("lemma is required"),
        body("words.*.pos").notEmpty().withMessage("pos is required"),
    ],
    errorHandler,
    syncVocabularyController
);

// Total word count for profile screen
router.get(
    "/api/vocabulary/count",
    requireAuth,
    errorHandler,
    getVocabularyCountController
);

export { router as VocabularyRouter };