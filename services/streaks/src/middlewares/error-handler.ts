import type { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/custom-errors.js";
import { DatabaseConnectionErrors } from "../errors/database-connection-errors.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";

/**
 * Global error handler. Always the LAST middleware mounted on the app.
 *
 * Routes CustomError subclasses to their declared statusCode; unknown
 * errors become 500. The default-400 fallback that the previous handler
 * shipped is dangerous (it tells clients "your input was bad" when the
 * real cause is a server-side bug).
 *
 * NOTE: `err.serializeErrors()` is a METHOD, not a property. The previous
 * implementation referenced the property (which is undefined) and shipped
 * an empty response body for every error — fixed.
 */
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

    // Unknown error — log it (server-side responsibility) and return a
    // neutral 500. Never expose `err.message` to the client; it could
    // leak schema, paths, or secret values.
    console.error("[error-handler] unhandled error:", err);
    return res
        .status(500)
        .send({ errors: [{ message: "Something went wrong!" }] });
};
