import type { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/custom-errors.js";

export const errorHandler = (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    if (err instanceof CustomError) {
        return res.status(err.statusCode).json({ errors: err.serializeErrors() });
    }

    console.error("Unhandled error:", err);
    res.status(500).json({ errors: [{ message: "Something went wrong!" }] });
};