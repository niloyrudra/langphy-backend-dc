import { StreakModel } from "../models/streaks.model.js";

const celebrationFor = (streak: number) => {
  if (streak === 1) return "streak_1";
  if (streak === 3) return "streak_3";
  if (streak === 7) return "streak_7";
  if (streak === 14) return "streak_14";
  if (streak === 21) return "streak_21";
  if (streak === 30) return "streak_30";
  if (streak === 50) return "streak_50";
  if (streak === 100) return "streak_100";
  return null;
};

type ApplyActivityInput = {
  userId: string;
};

type ApplyActivityResult = {
  updated: boolean;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  celebration: string | null;
};

export class StreakRepo {
  static async applyActivity( input: ApplyActivityInput ): Promise<ApplyActivityResult> {
    try {
      // 1️⃣ Ensure streak exists
      let streak = await StreakModel.findByUserId(input.userId);

      if (!streak) {
        streak = await StreakModel.createStreak(input.userId);
      }

      // 2️⃣ Apply DB-level streak update
      const updatedStreak = await StreakModel.updateStreak(input.userId);

      // 3️⃣ Detect idempotent same-day call
      const updated =
        streak?.last_activity_date !== updatedStreak.last_activity_date;

      // 4️⃣ Celebration is derived, not stored
      const celebration = celebrationFor(
        updatedStreak.current_streak
      );

      return {
        updated,
        currentStreak: updatedStreak.current_streak,
        longestStreak: updatedStreak.longest_streak,
        lastActivityDate: updatedStreak.last_activity_date!,
        celebration,
      };
    } catch (error) {
      console.error("StreakRepo.applyActivity error:", error);

      return {
        updated: false,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: "",
        celebration: null,
      };
    }
  }

  static async deleteStreak( user_id: string ) {
    try {
      return await StreakModel.deleteStreakByUserId( user_id );
    }
    catch(error) {
      console.error("deleteStreakByUserId error:", error);
      return false;
    }
  }
}