import type { PoolClient } from "pg";
import { pgPool } from "../db/index.js";
import { VocabArenaModel, type SrsWord, type UserGameProfile, type VocabSession } from "../models/vocab-arena.model.js";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { DeletedUsersModel } from "../models/deleted-users.model.js";

export interface StartSessionArgs {
    userId: string;
    mode: 'flashcard' | 'typing' | 'audio' | 'mixed';
    words: SrsWord[];
}

export interface StartSessionResult {
    sessionId: string;
    words: SrsWord[];
}

export interface SubmitAnswerArgs {
    userId: string;
    sessionId: string;
    lemma: string;
    grade: number; // 0-5 SM-2 grade
    responseTimeMs: number;
}

export interface SubmitAnswerResult {
    word: SrsWord;
    isCorrect: boolean;
    xpEarned: number;
}

export interface CompleteSessionArgs {
    userId: string;
    sessionId: string;
    mode: 'flashcard' | 'typing' | 'audio' | 'mixed';
    wordsTotal: number;
    wordsCorrect: number;
    durationMs: number;
    xpEarned: number;
    newWordsLearned: number;
}

export interface CompleteSessionResult {
    profile: UserGameProfile;
    newAchievements: { code: string; name: string; xp_reward: number }[];
}

/**
 * Transactional wrapper for vocab-arena operations.
 */
export class VocabArenaRepo {
    // ── Session Management ──────────────────────────────────────────────

    static async startSession(args: StartSessionArgs): Promise<StartSessionResult> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            // Ensure profile exists
            await VocabArenaModel.upsertProfile(args.userId);

            // Create session record
            const session = await VocabArenaModel.createSession({
                user_id: args.userId,
                mode: args.mode,
                words_total: args.words.length,
                words_correct: 0, // Will be updated on completion
                duration_ms: 0,   // Will be updated on completion
                xp_earned: 0,     // Will be updated on completion
            });

            // Ensure all words exist in SRS schedule
            for (const word of args.words) {
                await VocabArenaModel.upsertWord(args.userId, word);
            }

            await client.query("COMMIT");
            return { sessionId: session.id, words: args.words };
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    static async submitAnswer(args: SubmitAnswerArgs): Promise<SubmitAnswerResult> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            // Update SRS schedule with SM-2
            const updatedWord = await VocabArenaModel.updateSrsAfterReview(
                args.userId,
                args.lemma,
                args.grade
            );

            const isCorrect = args.grade >= 3;
            const xpEarned = isCorrect ? 10 + Math.max(0, 5 - args.responseTimeMs / 1000) : 0;

            await client.query("COMMIT");
            return { word: updatedWord, isCorrect, xpEarned: Math.round(xpEarned) };
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    static async completeSession(args: CompleteSessionArgs): Promise<CompleteSessionResult> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            // Update session record
            await VocabArenaModel.completeSession(args.sessionId);

            // Add XP
            const profile = await VocabArenaModel.addXp(args.userId, args.xpEarned);

            // Update streak (check if new day)
            const today = new Date();
            const isNewDay = !profile.last_session_date || 
                new Date(profile.last_session_date).toDateString() !== today.toDateString();
            const updatedProfile = await VocabArenaModel.updateStreak(args.userId, today, isNewDay);

            // Increment words learned
            if (args.newWordsLearned > 0) {
                await VocabArenaModel.incrementWordsLearned(args.userId, args.newWordsLearned);
            }

            // Check and unlock achievements
            const newAchievements = await this.checkAndUnlockAchievements(client, args.userId, {
                wordsCorrect: args.wordsCorrect,
                wordsTotal: args.wordsTotal,
                currentStreak: updatedProfile.current_streak,
                totalWordsLearned: updatedProfile.total_words_learned + args.newWordsLearned,
                sessionTime: today,
            });

            await client.query("COMMIT");
            return { profile: updatedProfile, newAchievements };
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    // ── Profile & Stats ─────────────────────────────────────────────────

    static async getProfile(userId: string) {
        return await VocabArenaModel.getProfile(userId);
    }

    static async getDueWords(userId: string, limit: number) {
        return await VocabArenaModel.getDueWords(userId, limit);
    }

    static async getNewWords(userId: string, limit: number) {
        return await VocabArenaModel.getNewWords(userId, limit);
    }

    static async getLeaderboard(limit: number = 50) {
        return await VocabArenaModel.getLeaderboard(limit);
    }

    static async getWeeklyLeaderboard(limit: number = 50) {
        return await VocabArenaModel.getWeeklyLeaderboard(limit);
    }

    static async getAchievements(userId: string) {
        const [allDefs, userAchievements] = await Promise.all([
            VocabArenaModel.getAllAchievements(),
            VocabArenaModel.getUserAchievements(userId),
        ]);

        const unlockedSet = new Set(userAchievements.map(a => a.code));
        return allDefs.map(def => ({
            ...def,
            unlocked: unlockedSet.has(def.code),
            unlocked_at: userAchievements.find(a => a.code === def.code)?.unlocked_at ?? null,
        }));
    }

    // ── Kafka Consumer Helpers ──────────────────────────────────────────

    static async deleteUserData(userId: string, envelope: {
        event_id: string;
        event_type: "user.deleted.v1";
        event_version: 1;
        occurred_at: Date | string;
        user_id: string;
        payload: unknown;
    }): Promise<void> {
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");

            await DeletedUsersModel.insertDeletedUser(userId);
            await client.query(`DELETE FROM srs_schedule WHERE user_id = $1`, [userId]);
            await client.query(`DELETE FROM user_game_profile WHERE user_id = $1`, [userId]);
            await client.query(`DELETE FROM user_achievement WHERE user_id = $1`, [userId]);
            await client.query(`DELETE FROM vocab_session WHERE user_id = $1`, [userId]);

            await EventIndexModel.markProcessed({
                event_id: envelope.event_id,
                event_type: envelope.event_type,
                event_version: envelope.event_version,
                user_id: envelope.user_id,
                occurred_at: envelope.occurred_at,
                payload: envelope.payload,
            });

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    // ── Private Helpers ─────────────────────────────────────────────────

    private static async checkAndUnlockAchievements(
        client: PoolClient,
        userId: string,
        stats: {
            wordsCorrect: number;
            wordsTotal: number;
            currentStreak: number;
            totalWordsLearned: number;
            sessionTime: Date;
        }
    ): Promise<{ code: string; name: string; xp_reward: number }[]> {
        const newAchievements: { code: string; name: string; xp_reward: number }[] = [];
        const userAchievements = await VocabArenaModel.getUserAchievements(userId);
        const unlockedSet = new Set(userAchievements.map(a => a.code));

        // Get all achievement definitions
        const allDefs = await VocabArenaModel.getAllAchievements();

        for (const def of allDefs) {
            if (unlockedSet.has(def.code)) continue;

            let shouldUnlock = false;

            switch (def.code) {
                case 'first_session':
                    shouldUnlock = true;
                    break;
                case 'first_50':
                    shouldUnlock = stats.totalWordsLearned >= 50;
                    break;
                case 'first_100':
                    shouldUnlock = stats.totalWordsLearned >= 100;
                    break;
                case 'first_500':
                    shouldUnlock = stats.totalWordsLearned >= 500;
                    break;
                case 'streak_3':
                    shouldUnlock = stats.currentStreak >= 3;
                    break;
                case 'streak_7':
                    shouldUnlock = stats.currentStreak >= 7;
                    break;
                case 'streak_30':
                    shouldUnlock = stats.currentStreak >= 30;
                    break;
                case 'perfect_session':
                    shouldUnlock = stats.wordsCorrect === stats.wordsTotal && stats.wordsTotal > 0;
                    break;
                case 'night_owl':
                    shouldUnlock = stats.sessionTime.getHours() >= 22;
                    break;
                case 'early_bird':
                    shouldUnlock = stats.sessionTime.getHours() < 7;
                    break;
                case 'speed_demon':
                    // This would need more context, skip for now
                    shouldUnlock = false;
                    break;
                case 'comeback_kid':
                    // Would need to track streak breaks, skip for now
                    shouldUnlock = false;
                    break;
            }

            if (shouldUnlock) {
                const result = await client.query(
                    `INSERT INTO user_achievement (user_id, code)
                     VALUES ($1, $2)
                     ON CONFLICT (user_id, code) DO NOTHING
                     RETURNING user_id, code`,
                    [userId, def.code],
                );
                if (result.rowCount && result.rowCount > 0) {
                    newAchievements.push({ code: def.code, name: def.name, xp_reward: def.xp_reward });
                    // Award achievement XP
                    await VocabArenaModel.addXp(userId, def.xp_reward);
                }
            }
        }

        return newAchievements;
    }
}