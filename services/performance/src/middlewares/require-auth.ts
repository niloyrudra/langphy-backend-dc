import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
    id: string;
    email: string;
    created_at: string;
};

export interface AuthRequest extends Request {
    user?: JwtPayload;
};

export const requireAuth = ( req: AuthRequest, res: Response, next: NextFunction ) => {
    const authHeader = req.headers.authorization;

    if( !authHeader?.startsWith("Bearer ") ) {
        return res.status(401).json({
            errors: [{
                message: "Not Authorized"
            }],
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_KEY!
        ) as JwtPayload;

        req.user = payload;
        next();
    }
    catch(error) {
        return res.status(401).json({
            errors: [{
                message: "Invalid token"
            }],
        });
    }
};