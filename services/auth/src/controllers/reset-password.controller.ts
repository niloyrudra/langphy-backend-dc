import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../models/user.model.js";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
// import { publishUserPasswordChanged } from "../kafka/producer.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

export const resetPasswordByEmailController = async ( req: AuthRequest, res: Response ) => {
    const errors = validationResult(req);
    
    if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );
    
    const user_email = req.user?.email;
    const { email, password } = req.body;
    if( !user_email ) {
        throw new BadRequestError( "User is not authorized!" );
    }
    if( user_email.trim() !== email.trim() ) {
        throw new BadRequestError( "Email is not in database!" );
    }
    try {
        const existingUser = await UserModel.findByEmail( user_email as string );

        if( !existingUser ) {
            throw new BadRequestError( "Email is not in use!" );
        }

        const user = await UserModel.resetPasswordByEmail( user_email as string, password );

        /** KAFKA */
        /**
         * Emit user.passwrd.changed event
         * This initializes user-related services (profile, settings, etc.)
         * Consumers must be idempotent
         */
        // try {
        //     await publishUserPasswordChanged({
        //         event_id: uuidv4(),
        //         event_type: "user.password.changed",
        //         event_version: 1,
        //         occurred_at: new Date().toISOString(),
        //         user_id: user.id,
        //         payload: {
        //             forced: false
        //         },
        //     });
        // }
        // catch(eventError) {
        //     console.error( "Kafka publish failed:", eventError );
        // }
        /** KAFKA */
        
        res.status( 200 ).send({
            message: "Password reset successfully!",
        });
    }
    catch( err ) {
        console.error( "Password reset failed:", err );
        // throw new DatabaseConnectionErrors();
        throw err;
    }
};

export const resetPasswordController = async ( req: AuthRequest, res: Response ) => {
    const errors = validationResult( req );
    if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );
    const user_id = req.user?.id;
    const { password } = req.body;
    if(!user_id) throw new BadRequestError("User is not authorized!")
    try {
        const user = await UserModel.resetPasswordByUserId( user_id as string, password );
        /** KAFKA */
        /**
         * Emit user.passwrd.changed event
         * This initializes user-related services (profile, settings, etc.)
         * Consumers must be idempotent
         */
        // try {
        //     await publishUserPasswordChanged({
        //         event_id: uuidv4(),
        //         event_type: "user.password.changed",
        //         event_version: 1,
        //         occurred_at: new Date().toISOString(),
        //         user_id: user.id,
        //         payload: {
        //             forced: false
        //         },
        //     });
        // }
        // catch(eventError) {
        //     console.error( "Auth - Kafka publish failed:", eventError );
        // }
        /** KAFKA */

        res.status(200).json({ message: "Password changed successfully!" });
    }
    catch(err) {
        console.error( "Password reset by user id failed", err );
        throw err;
    }
};
