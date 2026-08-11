import { CustomError } from "./custom-errors.js";

/**
 * 401 — thrown when the request lacks a valid Bearer token. Used by
 * require-auth and any handler that needs an authenticated user.
 *
 * Always throws — never `res.status(...).json(...)` from middleware.
 */
export class NotAuthorizedError extends CustomError {
    statusCode = 401;
    reason = "Not authorized";

    constructor(message = "Not authorized") {
        super(message);
        this.reason = message;
        Object.setPrototypeOf(this, NotAuthorizedError.prototype);
    }

    serializeErrors() {
        return [{ message: this.reason }];
    }
}
