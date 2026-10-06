import { CustomError } from "./custom-errors.js";

export class RequestValidationError extends CustomError {
    statusCode = 400;

    constructor(public errors: { message: string; field?: string }[]) {
        super("Request validation failed");
        Object.setPrototypeOf(this, RequestValidationError.prototype);
    }

    serializeErrors() {
        return this.errors;
    }
}