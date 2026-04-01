import { CustomError } from "./custom-errors.js";

export class ConflictValidationError extends CustomError {
    statusCode = 409;
    reason = "User already exists!";
    constructor() {
        super( "User already exists!" );

        Object.setPrototypeOf( this, ConflictValidationError.prototype ); // As we extend Error Class
    }

    serializeErrors() {
        return [
            { message: this.reason }
        ];
    }
}