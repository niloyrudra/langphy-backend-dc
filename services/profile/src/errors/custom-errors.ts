/**
 * Base class for all custom HTTP errors in this service.
 *
 * Subclasses MUST:
 *   - declare `statusCode: number` (or override it)
 *   - implement `serializeErrors()`
 *
 * The `Object.setPrototypeOf` dance is done once here so subclasses don't
 * need to repeat it. Without this, `instanceof CustomError` fails when
 * targeting ES5 with class-extends-Error.
 */
export abstract class CustomError extends Error {
    abstract statusCode: number;

    constructor(message?: string) {
        super(message ?? "Custom error");
        Object.setPrototypeOf(this, new.target.prototype);
    }

    abstract serializeErrors(): { message: string; field?: string }[];
}
