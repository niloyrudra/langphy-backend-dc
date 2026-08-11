import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middlewares/require-auth.js";
import { StreakModel, type UserStreak } from "../models/streaks.model.js";
import { StreakMilestonesModel } from "../models/streak-milestones.model.js";
import { NotFoundError } from "../errors/no-find-errors.js";
import { NotAuthorizedError } from "../errors/not-authorized-errors.js";

export interface StreakView {
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
    user_timezone: string;
    is_active: boolean;
    next_milestone: { days: number; label: string } | null;
    just_crossed: string | null;
}

/**
 * GET /api/streaks — return the authenticated user's current streak.
 *
 * Always throws on failure; the global errorHandler converts to JSON.
 */
export const getStreakController = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction,
) => {
    const userId = req.user?.id;
    if (!userId) {
        // requireAuth should have already rejected, but guard anyway.
        throw new NotAuthorizedError("Missing user");
    }

    const streak = await StreakModel.findByUserId(userId);
    if (!streak) {
        throw new NotFoundError("Streak not found");
    }

    const view = await toStreakView(streak);
    res.status(200).json({
        message: "Streak fetched successfully",
        streak: view,
    });
};

async function toStreakView(streak: UserStreak): Promise<StreakView> {
    const milestones = await StreakMilestonesModel.getMilestones();
    const sorted = [...milestones].sort((a, b) => a.days - b.days);
    const next = sorted.find((m) => m.days > streak.current_streak) ?? null;
    return {
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
        last_activity_date: streak.last_activity_date,
        user_timezone: streak.user_timezone,
        is_active: streak.current_streak > 0,
        next_milestone: next
            ? { days: next.days, label: next.label }
            : null,
        just_crossed: null, // Reserved for future "you just hit a milestone" UX; not persisted.
    };
}