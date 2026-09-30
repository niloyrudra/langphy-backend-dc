import type { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/custom-errors.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { DatabaseConnectionErrors } from "../errors/database-connection-errors.js";

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {

    if (err instanceof RequestValidationError) {
        return res.status(err.statusCode).send({ errors: err.serializeErrors() });
    }

    if (err instanceof DatabaseConnectionErrors) {
        return res.status(err.statusCode).send({ errors: err.serializeErrors() });
    }

    if (err instanceof CustomError) return res.status(err.statusCode).send({ errors: err.serializeErrors() });

    // Malformed JSON from the client is a client mistake — 400, not 500.
    // (body-parser errors carry a `type` property not on the base Error type.)
    if ((err as any).type === "entity.parse.failed") {
        return res.status(400).send({ errors: [{ message: "Invalid JSON body" }] });
    }

    // Anything not modelled as a CustomError is a SERVER-side fault, not a
    // client error. Log it and return 500 — before this change every stray
    // exception (DB down, unhandled bug) surfaced as a misleading 400.
    console.error("[error-handler] unhandled error:", err);
    res.status(500).send({ errors: [{ message: "Something went wrong!" }] });
}