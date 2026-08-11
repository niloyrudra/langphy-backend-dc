import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";

/**
 * express-validator result handler. Routes a non-empty validation result
 * to RequestValidationError so the global errorHandler returns the
 * correct 400 + structured body.
 *
 * Mirrors services/auth/src/middlewares/validate-auth.ts.
 */
export const validateAuth = async (
    req: Request,
    _res: Response,
    next: NextFunction,
) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        throw new RequestValidationError(errors.array());
    }

    next();
};
