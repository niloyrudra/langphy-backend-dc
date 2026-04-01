import type { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/custom-errors.js";

export const errorHandler = (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    if( err instanceof CustomError ) return res.status(err.statusCode).json({ errors: err.serializeErrors });
    res.status( 400 ).json({ errors: [{message: "Something went wrong!"}] });
}