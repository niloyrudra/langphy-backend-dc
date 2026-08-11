import { CustomError } from "./custom-errors.js";

/**
 * Generic 409 Conflict. Construct with a custom message; the previous
 * implementation hardcoded "User already exists" which is auth-specific
 * and unreachable from this service.
 */
export class ConflictError extends CustomError {
    statusCode = 409;

    constructor(public readonly message: string = "Conflict") {
        super(message);
        Object.setPrototypeOf(this, ConflictError.prototype);
    }

    serializeErrors() {
        return [{ message: this.message }];
    }
}
