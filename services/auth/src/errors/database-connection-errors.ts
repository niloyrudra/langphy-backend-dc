import { CustomError } from "./custom-errors.js";

export class DatabaseConnectionErrors extends CustomError {
    statusCode = 500;
    reason = "Error database connection!";

    constructor() {
        super("Error database connection!");
    }

    serializeErrors() {
        return [{ message: this.reason }];
    }
}