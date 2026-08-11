import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { NotAuthorizedError } from "../errors/not-authorized-errors.js";

/**
 * JWT payload shape. Mirrors auth's require-auth so a token issued by
 * services/auth verifies here with no translation.
 */
export interface JwtPayload {
    id: string;
    email: string;
    created_at: string;
}

export interface AuthRequest extends Request {
    user?: JwtPayload;
}

/**
 * Bearer-token guard. Always throws on failure — never returns
 * `res.status(...)` directly. The global errorHandler converts the
 * thrown NotAuthorizedError into a 401 response.
 *
 * Reads `process.env.JWT_KEY` which is guaranteed present and 64-hex by
 * validateEnv() at boot, so no defensive `!`-bang is needed here.
 */
export const requireAuth = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new NotAuthorizedError("Not Authorized");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        throw new NotAuthorizedError("Not Authorized");
    }

    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_KEY!,
        ) as unknown as JwtPayload;

        req.user = payload;
        next();
    } catch {
        throw new NotAuthorizedError("Invalid token");
    }
};
