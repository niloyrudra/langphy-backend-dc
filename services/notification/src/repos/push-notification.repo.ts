import { DeviceTokenModel } from "../models/device-token.model.js";
import type { Notification } from "../controllers/notifications.controller.js";

/**
 * Sends a push notification to all registered Expo push tokens for a user.
 *
 * Uses Expo's push API directly — no Firebase Admin SDK or FCM credentials needed.
 * Tokens must be Expo push tokens (ExponentPushToken[xxxxx]) registered via
 * expo-notifications on the client.
 *
 * Expo handles platform delivery (APNs for iOS, FCM for Android) transparently.
 *
 * Cleans up invalid tokens automatically on 404/DeviceNotRegistered responses.
 */
export const sendExpoPush = async (notification: Notification): Promise<void> => {
    try {
        const tokens = await DeviceTokenModel.findByUserId(notification.user_id);
        if (!tokens.length) return;

        const messages = tokens.map(token => ({
            to:    token,
            sound: "default",
            title: notification.title,
            body:  notification.body,
            data:  notification.data ?? {},
        }));

        const res = await fetch("https://exp.host/--/api/v2/push/send", {
            method:  "POST",
            headers: {
                "Accept":       "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(messages),
        });

        if (!res.ok) {
            console.error(`[sendExpoPush] Expo API error ${res.status}:`, await res.text());
            return;
        }

        const result = await res.json();

        // Clean up invalid/expired tokens
        const data: any[] = Array.isArray(result.data) ? result.data : [];
        const invalidTokens: string[] = [];

        data.forEach((item, index) => {
            if (
                item.status === "error" &&
                (item.details?.error === "DeviceNotRegistered" ||
                 item.details?.error === "InvalidCredentials")
            ) {
                invalidTokens.push(tokens[index]);
            }
        });

        for (const token of invalidTokens) {
            await DeviceTokenModel.deleteToken(token);
            console.log(`[sendExpoPush] Removed stale token: ${token}`);
        }

    } catch (error) {
        console.error("[sendExpoPush] error:", error);
    }
};


// import { DeviceTokenModel } from "../models/device-token.model.js";
// import type { Notification } from "../controllers/notifications.controller.js";

// export const sendExpoPush = async ( notification: Notification ) => {
//     try {
//         const tokens = await DeviceTokenModel.findByUserId( notification.user_id );
//         if(!tokens.length) return;

//         const messages = tokens.map(token => ({
//             to: token,
//             sound: "default",
//             title: notification.title,
//             body: notification.body,
//             data: notification.data ?? {}
//         }));

//         await fetch(
//             `https://exp.host/--/api/v2/push/send`,
//             {
//                 method: "POST",
//                 headers: {
//                     Accept: "application/json",
//                     "Content-Type": "application/json"
//                 },
//                 body: JSON.stringify(messages)
//             }
//         );
//     }
//     catch(error) {
//         console.error("Push-Notification Repo sendExpoPush error:", error);
//     }
// };