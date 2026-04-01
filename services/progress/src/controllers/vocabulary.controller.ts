import type { Response, NextFunction } from "express";
import { VocabularyRepo } from "../repos/vocabulary.repo.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

/**
 * POST /api/vocabulary/sync
 * Body: { words: VocabularyWord[] }
 *
 * Called by the app background sync when dirty vocabulary records exist.
 * Idempotent — re-syncing the same lemma for the same user is a no-op.
 */
export const syncVocabularyController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const { words } = req.body;

        if (!Array.isArray(words) || words.length === 0) {
            return res.status(400).json({ message: "words array is required" });
        }

        // Validate each word has minimum required fields
        const valid = words.filter(
            (w: any) => w.word && w.lemma && w.pos
        );

        if (!valid.length) {
            return res.status(400).json({ message: "No valid words provided" });
        }

        const { inserted } = await VocabularyRepo.syncWords(userId, valid);

        return res.status(200).json({
            message: "Vocabulary synced",
            inserted,          // new words added
            received: valid.length,
        });
    } catch (err) {
        console.error("syncVocabularyController error:", err);
        next(err);
    }
};

/**
 * GET /api/vocabulary/count
 *
 * Returns the total unique word count for the authenticated user.
 * Used by the profile screen.
 */
export const getVocabularyCountController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const count = await VocabularyRepo.getCount(userId as string);

        return res.status(200).json({ count });
    } catch (err) {
        console.error("getVocabularyCountController error:", err);
        next(err);
    }
};