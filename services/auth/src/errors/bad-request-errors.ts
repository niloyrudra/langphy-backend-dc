import { CustomError } from "./custom-errors.js";

export class BadRequestError extends CustomError {
    statusCode: number;

    constructor(public message: string, suppliedStatusCode?: number) {
        super(message);
        this.statusCode = suppliedStatusCode ?? 400;
    }

    serializeErrors() {
        return [{ message: this.message }];
    }
}