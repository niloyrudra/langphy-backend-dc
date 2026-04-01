import { CustomError } from "./custom-errors.js";

export class BadRequestError extends CustomError {
    statusCode = 400;

    constructor( public message: string, public suppliedStatusCode?: number ) {
        super( message );
        this.statusCode = suppliedStatusCode ?? 400;
        Object.setPrototypeOf( this, BadRequestError.prototype );
    }

    serializeErrors() {
        return [
            {
                message: this.message
            }
        ]
    }
}