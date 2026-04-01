import { UserDailyActivityModel } from "../models/user-daily-activity.model.js";

export const deleteUserActivity = async ( user_id: string ) => {
    try {
        await UserDailyActivityModel.deleteUserDailyActivity(user_id);
    }
    catch(error) {
        console.error("deleteUserActivity Repo error:", error)
    }
}