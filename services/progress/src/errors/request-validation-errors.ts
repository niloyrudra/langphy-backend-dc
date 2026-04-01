import type { ValidationError } from "express-validator";
import { CustomError } from "./custom-errors.js";

export class RequestValidationError extends CustomError {
    statusCode = 400;
    constructor( public errors: ValidationError[] ) {
        super( "Invalid rquest parameters!" );

        Object.setPrototypeOf( this, RequestValidationError.prototype ); // As we extend Error Class
    }

    serializeErrors() {
        return this.errors.map((err) => {
            if (err.type === 'field') {
                return { message: err.msg, field: err.path };
            }
            return { message: err.msg };
        });
    }
}