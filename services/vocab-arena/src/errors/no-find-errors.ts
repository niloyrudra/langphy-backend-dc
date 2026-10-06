import { CustomError } from "./custom-errors.js";

export class NoFindError extends CustomError {
    statusCode = 404;

    constructor(public message: string) {
        super(message);
        Object.setPrototypeOf(this, NoFindError.prototype);
    }

    serializeErrors() {
        return [{ message: this.message }];
    }
}