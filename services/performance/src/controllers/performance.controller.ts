import type { Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { PerformanceModel } from "../models/performance.model.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

export const updatePerformanceController = async ( req: AuthRequest, res: Response, next: NextFunction ) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new RequestValidationError(errors.array());
    }
    const userId = req.user?.id;
    if(!userId) throw new BadRequestError("User ID is required");
    try {
        const user_id = typeof userId === 'string' ? userId : "";
        const data = await PerformanceModel.getSummary( user_id );
    
        if( !data ) return res.status(404).json({ message: "No data found!" });
    
        res.status(200).json(data);
    }
    catch(err) {
        next(err);
    }
}