import type { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/custom-errors.js";
import { DatabaseConnectionErrors } from "../errors/database-connection-errors.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";

export const errorHandler = (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
) => {
    if (err instanceof RequestValidationError) {
        return res
            .status(err.statusCode)
            .send({ errors: err.serializeErrors() });
    }

    if (err instanceof DatabaseConnectionErrors) {
        return res
            .status(err.statusCode)
            .send({ errors: err.serializeErrors() });
    }

    if (err instanceof CustomError) {
        return res
            .status(err.statusCode)
            .send({ errors: err.serializeErrors() });
    }

    console.error("[error-handler] unhandled error:", err);
    return res
        .status(500)
        .send({ errors: [{ message: "Something went wrong!" }] });
};