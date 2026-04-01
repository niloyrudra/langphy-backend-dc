import type { Request, Response } from "express";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { DeviceTokenModel } from "../models/device-token.model.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

export const registerDeviceToken = async ( req: AuthRequest, res: Response ) => {
    const errors = validationResult( req );
    if( !errors.isEmpty() ) throw new RequestValidationError( errors.array() );

    try {
        const userId = req.user?.id;
        const { platform, token } = req.body;
        if( !userId || !platform || !token ) throw new BadRequestError("Missing required param(s)!");

        await DeviceTokenModel.upsertToken( userId, token, platform );
        res.status(204).send();
    }
    catch(error) {
        console.error("registerDeviceToken error:", error);
        throw error;
    }
};

export const deleteDeviceToken = async ( req: Request, res: Response ) => {
    try {
        const { token } = req.body;
        await DeviceTokenModel.deleteToken( token );
        res.status(200).json("Device token is deleted!");
    }
    catch(error) {
        console.error("deleteDeviceToken error:", error);
        throw error;
    }
};