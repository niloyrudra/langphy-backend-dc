import { DeviceTokenModel } from "../models/device-token.model.js";
import type { Notification } from "../controllers/notifications.controller.js";
import { pushProvider } from "../providers/push.provider.js";

export const sendPushNotification = async ( notification: Notification | null ) => {
    if(!notification) return;
    try {
        const tokens = await DeviceTokenModel.findByUserId( notification.user_id );
        if(!tokens?.length) return;

        const response = await pushProvider.send(
            tokens,
            {
                title: notification.title,
                body: notification.body,
                data: notification.data ?? {}
            }
        );

        // Optional cleanup
        for (const failedToken of response?.invalidTokens) {
            await DeviceTokenModel.deleteToken(failedToken);
        }
    }
    catch(error) {
        console.error("sendPushNotification error:", error);
    }
}