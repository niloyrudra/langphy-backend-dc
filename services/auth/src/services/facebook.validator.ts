import { BadRequestError } from "../errors/bad-request-errors.js";

const APP_ID = process.env.FACEBOOK_APP_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
if (!APP_ID || !APP_SECRET) {
    throw new Error("FACEBOOK_APP_ID and FACEBOOK_APP_SECRET required");
}

export interface FacebookUserInfo {
    user_id: string;
    email: string;
    name?: string;
    picture?: string;
}

export async function validateFacebookAccessToken(accessToken: string): Promise<FacebookUserInfo> {
    const debugUrl =
        `https://graph.facebook.com/v18.0/debug_token` +
        `?input_token=${encodeURIComponent(accessToken)}` +
        `&access_token=${encodeURIComponent(`${APP_ID}|${APP_SECRET}`)}`;

    const debugRes = await fetch(debugUrl);
    if (!debugRes.ok) {
        throw new BadRequestError("Facebook sign-in failed.");
    }
    const debug = await debugRes.json() as { data: any };
    if (!debug.data?.is_valid) {
        throw new BadRequestError("Facebook sign-in expired. Please try again.");
    }
    if (debug.data.app_id !== APP_ID) {
        throw new BadRequestError("Facebook token audience mismatch.");
    }
    if (!debug.data.scopes?.includes("email")) {
        throw new BadRequestError("Email permission required. Please grant access to your email.");
    }
    const userId = debug.data.user_id;

    const meUrl =
        `https://graph.facebook.com/v18.0/${encodeURIComponent(userId)}` +
        `?fields=id,name,email,picture.type(large)` +
        `&access_token=${encodeURIComponent(accessToken)}`;

    const meRes = await fetch(meUrl);
    if (!meRes.ok) {
        throw new BadRequestError("Facebook profile lookup failed.");
    }
    const me = await meRes.json() as Record<string, any>;

    if (!me.id || !me.email) {
        throw new BadRequestError("Email permission required. Please grant access to your email.");
    }

    return {
        user_id: me.id,
        email: me.email,
        name: me.name,
        picture: me.picture?.data?.url,
    };
}