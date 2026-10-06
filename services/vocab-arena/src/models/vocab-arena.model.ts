import { pgPool } from "../db/index.js";

export interface SrsWord {
    user_id: string;
    lemma: string;
    pos: string | null;
    meaning_en: string | null;
    ease_factor: number;
    interval_days: number;
    repetitions: number;
    next_review: Date;
    last_review: Date | null;
    last_grade: number | null;
}

export interface UserGameProfile {
    user_id: string;
    xp: number;
    level: number;
    current_streak: number;
    longest_streak: number;
    last_session_date: Date | null;
    total_words_learned: number;
    total_sessions: number;
    updated_at: Date;
}

export interface AchievementDef {
    code: string;
    name: string;
    description: string | null;
    xp_reward: number;
    icon: string | null;
}

export interface UserAchievement {
    user_id: string;
    code: string;
    unlocked_at: Date;
}

export interface VocabSession {
    id: string;
    user_id: string;
    mode: string;
    words_total: number;
    words_correct: number;
    duration_ms: number;
    xp_earned: number;
    started_at: Date;
    completed_at: Date | null;
}

/**
 * Data-access layer for vocab-arena tables. Pure SQL — no business logic.
 */
export class VocabArenaModel {
    // ── SRS Schedule ────────────────────────────────────────────────────

    static async getDueWords(userId: string, limit: number): Promise<SrsWord[]> {
        const result = await pgPool.query<SrsWord>(
            `SELECT user_id, lemma, pos, meaning_en,
                    ease_factor, interval_days, repetitions, next_review,
                    last_review, last_grade
             FROM srs_schedule
             WHERE user_id = $1
               AND next_review <= NOW()
             ORDER BY next_review ASC
             LIMIT $2`,
            [userId, limit],
        );
        return result.rows;
    }

    static async getNewWords(userId: string, limit: number): Promise<SrsWord[]> {
        const result = await pgPool.query<SrsWord>(
            `SELECT user_id, lemma, pos, meaning_en,
                    ease_factor, interval_days, repetitions, next_review,
                    last_review, last_grade
             FROM srs_schedule
             WHERE user_id = $1
               AND repetitions = 0
               AND next_review > NOW()
             ORDER BY next_review ASC
             LIMIT $2`,
            [userId, limit],
        );
        return result.rows;
    }

    static async upsertWord(userId: string, word: Partial<SrsWord> & { lemma: string }): Promise<void> {
        await pgPool.query(
            `INSERT INTO srs_schedule (user_id, lemma, pos, meaning_en,
                                       ease_factor, interval_days, repetitions, next_review,
                                       last_review, last_grade)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (user_id, lemma) DO UPDATE SET
                 pos = COALESCE(EXCLUDED.pos, srs_schedule.pos),
                 meaning_en = COALESCE(EXCLUDED.meaning_en, srs_schedule.meaning_en),
                 ease_factor = EXCLUDED.ease_factor,
                 interval_days = EXCLUDED.interval_days,
                 repetitions = EXCLUDED.repetitions,
                 next_review = EXCLUDED.next_review,
                 last_review = EXCLUDED.last_review,
                 last_grade = EXCLUDED.last_grade`,
            [
                userId,
                word.lemma,
                word.pos ?? null,
                word.meaning_en ?? null,
                word.ease_factor ?? 2.5,
                word.interval_days ?? 0,
                word.repetitions ?? 0,
                word.next_review ?? new Date(),
                word.last_review ?? null,
                word.last_grade ?? null,
            ],
        );
    }

    static async updateSrsAfterReview(
        userId: string,
        lemma: string,
        grade: number, // 0-5 SM-2 grade
        now: Date = new Date()
    ): Promise<SrsWord> {
        // Get current word state
        const current = await pgPool.query<SrsWord>(
            `SELECT * FROM srs_schedule WHERE user_id = $1 AND lemma = $2`,
            [userId, lemma],
        );

        if (!current.rows[0]) {
            throw new Error(`Word ${lemma} not found for user ${userId}`);
        }

        const w = current.rows[0];
        let { ease_factor, interval_days, repetitions } = w;

        // SM-2 Algorithm
        if (grade >= 3) {
            // Successful recall
            if (repetitions === 0) {
                interval_days = 1;
            } else if (repetitions === 1) {
                interval_days = 6;
            } else {
                interval_days = Math.round(interval_days * ease_factor);
            }
            repetitions += 1;
        } else {
            // Failed recall - reset
            repetitions = 0;
            interval_days = 0;
        }

        // Update ease factor
        ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

        const nextReview = new Date(now);
        nextReview.setDate(nextReview.getDate() + interval_days);

        await pgPool.query(
            `UPDATE srs_schedule
             SET ease_factor = $1,
                 interval_days = $2,
                 repetitions = $3,
                 next_review = $4,
                 last_review = $5,
                 last_grade = $6
             WHERE user_id = $7 AND lemma = $8`,
            [ease_factor, interval_days, repetitions, nextReview, now, grade, userId, lemma],
        );

        return {
            ...w,
            ease_factor,
            interval_days,
            repetitions,
            next_review: nextReview,
            last_review: now,
            last_grade: grade,
        };
    }

    // ── User Game Profile ───────────────────────────────────────────────

    static async getProfile(userId: string): Promise<UserGameProfile | null> {
        const result = await pgPool.query<UserGameProfile>(
            `SELECT user_id, xp, level, current_streak, longest_streak,
                    last_session_date, total_words_learned, total_sessions, updated_at
             FROM user_game_profile
             WHERE user_id = $1`,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    static async upsertProfile(userId: string): Promise<UserGameProfile> {
        const result = await pgPool.query<UserGameProfile>(
            `INSERT INTO user_game_profile (user_id, xp, level, current_streak, longest_streak,
                                            last_session_date, total_words_learned, total_sessions)
             VALUES ($1, 0, 1, 0, 0, NULL, 0, 0)
             ON CONFLICT (user_id) DO NOTHING
             RETURNING user_id, xp, level, current_streak, longest_streak,
                       last_session_date, total_words_learned, total_sessions, updated_at`,
            [userId],
        );

        if (result.rows[0]) return result.rows[0];

        const existing = await this.getProfile(userId);
        if (!existing) throw new Error(`Profile missing after conflict for user ${userId}`);
        return existing;
    }

    static async addXp(userId: string, xpGain: number): Promise<UserGameProfile> {
        const result = await pgPool.query<UserGameProfile>(
            `UPDATE user_game_profile
             SET xp = xp + $2,
                 level = FLOOR(SQRT((xp + $2) / 100)) + 1,
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING user_id, xp, level, current_streak, longest_streak,
                       last_session_date, total_words_learned, total_sessions, updated_at`,
            [userId, xpGain],
        );
        if (!result.rows[0]) throw new Error(`addXp: profile not found for user ${userId}`);
        return result.rows[0];
    }

    static async updateStreak(
        userId: string,
        sessionDate: Date,
        isNewStreak: boolean
    ): Promise<UserGameProfile> {
        const todayStr = sessionDate.toISOString().split('T')[0];
        const profile = await this.getProfile(userId);
        if (!profile) throw new Error(`Profile not found for user ${userId}`);

        let newCurrentStreak = profile.current_streak;
        let newLongestStreak = profile.longest_streak;

        if (isNewStreak) {
            if (profile.last_session_date) {
                const lastDate = new Date(profile.last_session_date);
                const diffDays = Math.floor((sessionDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    newCurrentStreak = profile.current_streak + 1;
                } else if (diffDays > 1) {
                    newCurrentStreak = 1;
                }
                // diffDays === 0 means same day, streak unchanged
            } else {
                newCurrentStreak = 1;
            }
            newLongestStreak = Math.max(newLongestStreak, newCurrentStreak);
        }

        const result = await pgPool.query<UserGameProfile>(
            `UPDATE user_game_profile
             SET current_streak = $2,
                 longest_streak = $3,
                 last_session_date = $4,
                 total_sessions = total_sessions + 1,
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING user_id, xp, level, current_streak, longest_streak,
                       last_session_date, total_words_learned, total_sessions, updated_at`,
            [userId, newCurrentStreak, newLongestStreak, todayStr],
        );
        return result.rows[0]!;
    }

    static async incrementWordsLearned(userId: string, count: number): Promise<void> {
        await pgPool.query(
            `UPDATE user_game_profile
             SET total_words_learned = total_words_learned + $2,
                 updated_at = NOW()
             WHERE user_id = $1`,
            [userId, count],
        );
    }

    // ── Achievements ────────────────────────────────────────────────────

    static async getAllAchievements(): Promise<AchievementDef[]> {
        const result = await pgPool.query<AchievementDef>(
            `SELECT code, name, description, xp_reward, icon
             FROM achievement_def
             ORDER BY xp_reward ASC`
        );
        return result.rows;
    }

    static async getUserAchievements(userId: string): Promise<UserAchievement[]> {
        const result = await pgPool.query<UserAchievement>(
            `SELECT user_id, code, unlocked_at
             FROM user_achievement
             WHERE user_id = $1`,
            [userId],
        );
        return result.rows;
    }

    static async unlockAchievement(userId: string, code: string): Promise<UserAchievement | null> {
        const result = await pgPool.query<UserAchievement>(
            `INSERT INTO user_achievement (user_id, code)
             VALUES ($1, $2)
             ON CONFLICT (user_id, code) DO NOTHING
             RETURNING user_id, code, unlocked_at`,
            [userId, code],
        );
        return result.rows[0] ?? null;
    }

    // ── Sessions ────────────────────────────────────────────────────────

    static async createSession(session: Omit<VocabSession, 'id' | 'started_at' | 'completed_at'> & { started_at?: Date }): Promise<VocabSession> {
        const result = await pgPool.query<VocabSession>(
            `INSERT INTO vocab_session (user_id, mode, words_total, words_correct, duration_ms, xp_earned, started_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, user_id, mode, words_total, words_correct, duration_ms, xp_earned, started_at, completed_at`,
            [session.user_id, session.mode, session.words_total, session.words_correct, session.duration_ms, session.xp_earned, session.started_at ?? new Date()],
        );
        return result.rows[0]!;
    }

    static async completeSession(sessionId: string, completedAt: Date = new Date()): Promise<void> {
        await pgPool.query(
            `UPDATE vocab_session SET completed_at = $1 WHERE id = $2`,
            [completedAt, sessionId],
        );
    }

    static async getUserSessions(userId: string, limit: number = 50): Promise<VocabSession[]> {
        const result = await pgPool.query<VocabSession>(
            `SELECT id, user_id, mode, words_total, words_correct, duration_ms, xp_earned, started_at, completed_at
             FROM vocab_session
             WHERE user_id = $1
             ORDER BY started_at DESC
             LIMIT $2`,
            [userId, limit],
        );
        return result.rows;
    }

    // ── Leaderboard ─────────────────────────────────────────────────────

    static async getLeaderboard(limit: number = 50): Promise<{ user_id: string; xp: number; level: number; current_streak: number }[]> {
        const result = await pgPool.query(
            `SELECT user_id, xp, level, current_streak
             FROM user_game_profile
             ORDER BY xp DESC
             LIMIT $1`,
            [limit],
        );
        return result.rows;
    }

    static async getWeeklyLeaderboard(limit: number = 50): Promise<{ user_id: string; xp: number }[]> {
        const result = await pgPool.query(
            `SELECT vs.user_id, SUM(vs.xp_earned) as xp
             FROM vocab_session vs
             WHERE vs.started_at >= NOW() - INTERVAL '7 days'
             GROUP BY vs.user_id
             ORDER BY xp DESC
             LIMIT $1`,
            [limit],
        );
        return result.rows;
    }
}