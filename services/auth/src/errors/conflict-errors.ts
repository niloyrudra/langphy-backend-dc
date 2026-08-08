import { CustomError } from "./custom-errors.js";

export class ConflictValidationError extends CustomError {
    statusCode = 409;
    reason = "User already exists!";

    constructor() {
        super("User already exists!");
    }

    serializeErrors() {
        return [{ message: this.reason }];
    }
}