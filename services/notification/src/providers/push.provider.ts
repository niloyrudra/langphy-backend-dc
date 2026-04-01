import admin from "firebase-admin";
import { type PushProvider, type PushResult } from "./provider.js";

export class FcmPushProvider implements PushProvider {
    async send(
        tokens: string[],
        payload: any
    ): Promise<PushResult> {

        const result = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: Object.fromEntries(
                Object
                    .entries(payload.data ?? {})
                    .map(([key, value]) => [key, String(value)])
            ),
        });

        const invalidTokens: string[] = [];

        result.responses.forEach((res, index) => {
            if (!res.success) {
                const errorCode = res.error?.code;

                if (errorCode === "messaging/registration-token-not-registered") {
                    invalidTokens.push(tokens[index]);
                }
            }
        });

        return {
            successCount: result.successCount,
            failureCount: result.failureCount,
            invalidTokens,
        };
    }
}

export const pushProvider = new FcmPushProvider();