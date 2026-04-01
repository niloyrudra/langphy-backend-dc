import { DeviceTokenModel } from "../models/device-token.model.js";
import type { Notification } from "../controllers/notifications.controller.js";

export const sendExpoPush = async ( notification: Notification ) => {
    try {
        const tokens = await DeviceTokenModel.findByUserId( notification.user_id );
        if(!tokens.length) return;

        const messages = tokens.map(token => ({
            to: token,
            sound: "default",
            title: notification.title,
            body: notification.body,
            data: notification.data ?? {}
        }));

        await fetch(
            `https://expo.host/--/api/v2/push/send`,
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(messages)
            }
        );
    }
    catch(error) {
        console.error("Push-Notification Repo sendExpoPush error:", error);
    }
};