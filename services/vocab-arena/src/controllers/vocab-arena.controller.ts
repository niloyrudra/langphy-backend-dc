import type { Response, NextFunction } from "express";
import { VocabArenaRepo, type StartSessionArgs, type SubmitAnswerArgs, type CompleteSessionArgs } from "../repos/vocab-arena.repo.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import type { AuthRequest } from "../middlewares/require-auth.js";
import { validationResult, type ValidationError as ExpressValidationError } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { v4 as uuidv4 } from "uuid";
import {
    publishVocabSessionCompleted,
    publishVocabWordMastered,
    publishVocabAchievementUnlocked,
} from "../kafka/producer.js";
import { TOPICS } from "@langphy/shared";

function toValidationErrors(errors: ExpressValidationError[]): { message: string; field?: string }[] {
    return errors.map(e => {
        if ('path' in e) {
            return { message: e.msg, field: e.path };
        }
        return { message: e.msg };
    });
}

/**
 * POST /api/vocab-arena/daily-set
 * Get today's due words + new words for the user
 */
export const getDailySetController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const profile = await VocabArenaRepo.getProfile(userId);
        if (!profile) {
            return res.status(404).json({ message: "Profile not found" });
        }

        // Get due words (max 10)
        const dueWords = await VocabArenaRepo.getDueWords(userId, 10);
        
        // Get new words (max 5)
        const newWords = await VocabArenaRepo.getNewWords(userId, 5);

        // If no words at all, seed from nlp-service dictionary
        // For now, return what we have
        const words = [...dueWords, ...newWords];

        return res.status(200).json({
            words,
            dueCount: dueWords.length,
            newCount: newWords.length,
            profile: {
                xp: profile.xp,
                level: profile.level,
                currentStreak: profile.current_streak,
                longestStreak: profile.longest_streak,
            },
        });
    } catch (err) {
        console.error("getDailySetController error:", err);
        next(err);
    }
};

/**
 * POST /api/vocab-arena/session/start
 * Body: { mode: 'flashcard' | 'typing' | 'audio' | 'mixed', words: SrsWord[] }
 */
export const startSessionController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(toValidationErrors(errors.array()));

    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const { mode, words } = req.body as StartSessionArgs;

        if (!mode || !['flashcard', 'typing', 'audio', 'mixed'].includes(mode)) {
            throw new BadRequestError("Invalid mode");
        }

        if (!Array.isArray(words) || words.length === 0) {
            throw new BadRequestError("Words array is required");
        }

        const result = await VocabArenaRepo.startSession({ userId, mode, words });

        return res.status(200).json({
            sessionId: result.sessionId,
            words: result.words,
        });
    } catch (err) {
        console.error("startSessionController error:", err);
        next(err);
    }
};

/**
 * POST /api/vocab-arena/session/:id/answer
 * Body: { lemma: string, grade: number, responseTimeMs: number }
 */
export const submitAnswerController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(toValidationErrors(errors.array()));

    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const sessionId = req.params.id as string;
        if (!sessionId) throw new BadRequestError("Session ID is required");
        const { lemma, grade, responseTimeMs } = req.body as SubmitAnswerArgs;

        if (!lemma || typeof grade !== 'number' || grade < 0 || grade > 5) {
            throw new BadRequestError("Invalid answer payload");
        }

        const result = await VocabArenaRepo.submitAnswer({
            userId,
            sessionId,
            lemma,
            grade,
            responseTimeMs: responseTimeMs ?? 0,
        });

        // If word is mastered (repetitions >= 3 and interval > 30), emit event
        if (result.word.repetitions >= 3 && result.word.interval_days > 30) {
            try {
                await publishVocabWordMastered({
                    event_id: uuidv4(),
                    event_type: TOPICS.VOCAB_WORD_MASTERED,
                    event_version: 1,
                    occurred_at: new Date(),
                    user_id: userId,
                    payload: {
                        lemma: result.word.lemma,
                        pos: result.word.pos ?? '',
                        meaning_en: result.word.meaning_en ?? '',
                        repetitions: result.word.repetitions,
                        ease_factor: result.word.ease_factor,
                        mastered_at: new Date(),
                    },
                });
            } catch (kafkaErr) {
                console.error("Failed to publish word mastered event:", kafkaErr);
            }
        }

        return res.status(200).json({
            isCorrect: result.isCorrect,
            xpEarned: result.xpEarned,
            word: result.word,
        });
    } catch (err) {
        console.error("submitAnswerController error:", err);
        next(err);
    }
};

/**
 * POST /api/vocab-arena/session/:id/complete
 * Body: { mode, wordsTotal, wordsCorrect, durationMs, xpEarned, newWordsLearned }
 */
export const completeSessionController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(toValidationErrors(errors.array()));

    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const sessionId = req.params.id as string;
        if (!sessionId) throw new BadRequestError("Session ID is required");
        const { mode, wordsTotal, wordsCorrect, durationMs, xpEarned, newWordsLearned } = req.body as CompleteSessionArgs;

        const result = await VocabArenaRepo.completeSession({
            userId,
            sessionId,
            mode,
            wordsTotal,
            wordsCorrect,
            durationMs,
            xpEarned,
            newWordsLearned,
        });

        // Emit session completed event
        try {
            await publishVocabSessionCompleted({
                event_id: uuidv4(),
                event_type: TOPICS.VOCAB_SESSION_COMPLETED,
                event_version: 1,
                occurred_at: new Date(),
                user_id: userId,
                payload: {
                    session_id: sessionId,
                    mode,
                    words_total: wordsTotal,
                    words_correct: wordsCorrect,
                    duration_ms: durationMs,
                    xp_earned: xpEarned,
                    new_words_learned: newWordsLearned,
                    completed_at: new Date(),
                },
            });
        } catch (kafkaErr) {
            console.error("Failed to publish session completed event:", kafkaErr);
        }

        // Emit achievement unlocked events
        for (const ach of result.newAchievements) {
            try {
                await publishVocabAchievementUnlocked({
                    event_id: uuidv4(),
                    event_type: TOPICS.VOCAB_ACHIEVEMENT_UNLOCKED,
                    event_version: 1,
                    occurred_at: new Date(),
                    user_id: userId,
                    payload: {
                        achievement_code: ach.code,
                        achievement_name: ach.name,
                        xp_reward: ach.xp_reward,
                        unlocked_at: new Date(),
                    },
                });
            } catch (kafkaErr) {
                console.error("Failed to publish achievement unlocked event:", kafkaErr);
            }
        }

        return res.status(200).json({
            profile: result.profile,
            newAchievements: result.newAchievements,
        });
    } catch (err) {
        console.error("completeSessionController error:", err);
        next(err);
    }
};

/**
 * GET /api/vocab-arena/profile
 */
export const getProfileController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const profile = await VocabArenaRepo.getProfile(userId);
        if (!profile) {
            return res.status(404).json({ message: "Profile not found" });
        }

        const achievements = await VocabArenaRepo.getAchievements(userId);

        return res.status(200).json({
            profile: {
                xp: profile.xp,
                level: profile.level,
                currentStreak: profile.current_streak,
                longestStreak: profile.longest_streak,
                totalWordsLearned: profile.total_words_learned,
                totalSessions: profile.total_sessions,
            },
            achievements,
        });
    } catch (err) {
        console.error("getProfileController error:", err);
        next(err);
    }
};

/**
 * GET /api/vocab-arena/leaderboard
 */
export const getLeaderboardController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const leaderboard = await VocabArenaRepo.getLeaderboard(limit);

        return res.status(200).json({ leaderboard });
    } catch (err) {
        console.error("getLeaderboardController error:", err);
        next(err);
    }
};

/**
 * GET /api/vocab-arena/leaderboard/weekly
 */
export const getWeeklyLeaderboardController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const leaderboard = await VocabArenaRepo.getWeeklyLeaderboard(limit);

        return res.status(200).json({ leaderboard });
    } catch (err) {
        console.error("getWeeklyLeaderboardController error:", err);
        next(err);
    }
};

/**
 * GET /api/vocab-arena/achievements
 */
export const getAchievementsController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new BadRequestError("Unauthorized");

        const achievements = await VocabArenaRepo.getAchievements(userId);

        return res.status(200).json({ achievements });
    } catch (err) {
        console.error("getAchievementsController error:", err);
        next(err);
    }
};