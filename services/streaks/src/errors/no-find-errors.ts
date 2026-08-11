import { CustomError } from "./custom-errors.js";

export class NotFoundError extends CustomError {
    statusCode = 404;

    constructor(public readonly message: string = "Not found") {
        super(message);
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }

    serializeErrors() {
        return [{ message: this.message }];
    }
}
