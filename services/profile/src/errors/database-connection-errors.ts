import { CustomError } from "./custom-errors.js";

export class DatabaseConnectionErrors extends CustomError {
    statusCode = 500;
    reason = 'Error database connection!';
    constructor() {
        super( "Error database connection!" );

        Object.setPrototypeOf( this, DatabaseConnectionErrors.prototype );
    }

    serializeErrors() {
        return [
            { message: this.reason }
        ];
    }
}