import type { NextFunction, Request, Response } from "express";
import { ProfileModel } from "../models/profile.model.js";
import { validationResult } from "express-validator";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

export const getProfileController = async ( req: AuthRequest, res: Response, next: NextFunction ) => {
    const errors = validationResult(req);

    if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );

    try {
        const user_id = req.user?.id;
        if(!user_id) throw new BadRequestError("No user id is provides.");
        const _user_id = typeof user_id == 'string' ? user_id : '';
        const profile = await ProfileModel.getProfile( _user_id );

        if( profile ) {
            res.status(200).send({
                message: "Profile fetched successfully!",
                profile: {
                    id: profile.id,
                    user_id: profile.user_id,
                    username: profile.username,
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    profile_image: profile.profile_image,
                    created_at: profile.created_at
                }
            });
        }

    }
    catch(err){
        console.log( "Pofile data fetching failuer error:", err )
        next(err)
        // throw new DatabaseConnectionErrors();
    }
}

export const updateProfileController = async ( req: AuthRequest, res: Response ) => {
    const errors = validationResult(req);

    if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );

    try {
        const updatedData = req.body;
        const userId = req.user?.id;
        if(!userId) throw new BadRequestError("No id is provided.");
        const user_id = typeof userId == 'string' ? userId : '';
        const profile = await ProfileModel.updateProfile( user_id, updatedData );

        if( profile ) {
            res.status(200).send({
                message: "Profile updated successfully!",
                profile: {
                    id: profile.id,
                    user_id: profile.user_id,
                    username: profile.username,
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    profile_image: profile.profile_image,
                    created_at: profile.created_at
                }
            });
        }

    }
    catch(err){
        console.log( "Pofile data fetching failuer error:", err )
        // next(err);
        // throw new DatabaseConnectionErrors();
        throw err;
    }
}

export const createProfileController = async ( req: AuthRequest, res: Response ) => {
    const errors = validationResult(req);

    if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );

    const userData = req.body;

    try {
        const newProfile = await ProfileModel.createProfile( userData );

        if( newProfile ) {
            res.status(201).send({
                message: "New Profile created successfully!",
                profile: {
                    id: newProfile.id,
                    username: newProfile.username,
                    first_name: newProfile.first_name,
                    last_name: newProfile.last_name,
                    profile_image: newProfile.profile_image,
                    created_at: newProfile.created_at
                }
            });
        }
    }
    catch(err) {
        console.log( "Pofile Creation error:", err )
        throw err;
        // throw new DatabaseConnectionErrors();
    }

}