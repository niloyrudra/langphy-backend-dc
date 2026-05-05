import { NotificationModel } from "../models/notification.model.js";
import type { Notification } from "../controllers/notifications.controller.js";

export const saveNotification = async (notification: Notification) => {
    try {
        await NotificationModel.insertNotification(notification);
    }
    catch(error) {
        console.error("saveNotification error:", error);
    }
}

export const deleteNotification = async ( user_id: string ) => {
    try {
        await NotificationModel.deleteUserNotifications(user_id);
    }
    catch(error) {
        console.error("deleteNotification Repo error:", error)
    }
}