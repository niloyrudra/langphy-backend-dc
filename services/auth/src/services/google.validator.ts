import { BadRequestError } from "../errors/bad-request-errors.js";

const EXPECTED_AUDIENCE = process.env.GOOGLE_WEB_CLIENT_ID!;
if (!EXPECTED_AUDIENCE) {
    throw new Error("GOOGLE_WEB_CLIENT_ID is required");
}

export interface GoogleUserInfo {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
}

export async function validateGoogleAccessToken(accessToken: string): Promise<GoogleUserInfo> {
    const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
    let res: Response;
    try {
        res = await fetch(url);
    } catch (err) {
        throw new BadRequestError("Could not reach Google for verification.");
    }
    if (!res.ok) {
        throw new BadRequestError("Google sign-in expired. Please try again.");
    }
    const data = await res.json() as Record<string, any>;

    if (data.aud !== EXPECTED_AUDIENCE) {
        throw new BadRequestError("Google token audience mismatch.");
    }
    if (Number(data.exp) * 1000 < Date.now()) {
        throw new BadRequestError("Google sign-in expired. Please try again.");
    }
    if (data.email_verified !== "true") {
        throw new BadRequestError("Email not verified by Google.");
    }
    if (!data.sub || !data.email) {
        throw new BadRequestError("Incomplete Google profile.");
    }

    return {
        sub: data.sub,
        email: data.email,
        email_verified: true,
        name: data.name,
        picture: data.picture,
    };
}