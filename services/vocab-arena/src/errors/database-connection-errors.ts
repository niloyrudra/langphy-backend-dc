import { CustomError } from "./custom-errors.js";

export class DatabaseConnectionErrors extends CustomError {
    statusCode = 503;

    constructor(public message: string) {
        super(message);
        Object.setPrototypeOf(this, DatabaseConnectionErrors.prototype);
    }

    serializeErrors() {
        return [{ message: this.message }];
    }
}