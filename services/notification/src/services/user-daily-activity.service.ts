import { UserDailyActivityModel } from "../models/user-daily-activity.model.js";

export const upsertUserDailyActivity = async (userId: string) => {
    try {
        await UserDailyActivityModel.upsertUserDailyActivity(userId);
    }
    catch(error) {
        console.error("upsertUserDailyActivity error:", error);
    }
};