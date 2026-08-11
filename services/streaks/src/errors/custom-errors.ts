/**
 * Common base for every error this service throws. Each subclass declares
 * its own statusCode and serializes itself to the `{ errors: [...] }` wire
 * shape the Expo client consumes.
 *
 * The constructor wires `Object.setPrototypeOf` so `instanceof CustomError`
 * survives transpilation to ES5 / cross-realm error throws.
 */
export abstract class CustomError extends Error {
    abstract statusCode: number;

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, CustomError.prototype);
    }

    abstract serializeErrors(): { message: string; field?: string }[];
}
