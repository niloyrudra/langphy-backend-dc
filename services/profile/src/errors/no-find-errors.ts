import { CustomError } from "./custom-errors.js";

export class NotFoundError extends CustomError {
    statusCode = 404;

    constructor() {
        super( "Route not found!" );
    }

    serializeErrors() {
        return [{ message: "Route not Found!" }]
    }
}