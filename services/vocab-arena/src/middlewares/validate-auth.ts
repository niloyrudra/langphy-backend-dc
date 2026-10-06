import type { Request, Response, NextFunction } from "express";
import { validationResult, type ValidationError as ExpressValidationError } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";

function toValidationErrors(errors: ExpressValidationError[]): { message: string; field?: string }[] {
    return errors.map(e => {
        if ('path' in e) {
            return { message: e.msg, field: e.path };
        }
        return { message: e.msg };
    });
}

/**
 * express-validator result handler. Routes a non-empty validation result
 * to RequestValidationError so the global errorHandler returns the
 * correct 400 + structured body.
 */
export const validateAuth = async (
    req: Request,
    _res: Response,
    next: NextFunction,
) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        throw new RequestValidationError(toValidationErrors(errors.array()));
    }

    next();
};