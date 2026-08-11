import { CustomError } from "./custom-errors.js";

export class DatabaseConnectionErrors extends CustomError {
    statusCode = 500;
    reason = "Database connection error";

    constructor(message: string = "Database connection error") {
        super(message);
        this.reason = message;
        Object.setPrototypeOf(this, DatabaseConnectionErrors.prototype);
    }

    serializeErrors() {
        return [{ message: this.reason }];
    }
}
