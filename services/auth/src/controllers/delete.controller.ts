import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { UserModel } from "../models/user.model.js";
import { publishUserDeleted } from "../kafka/producer.js";
import type { AuthRequest } from "../middlewares/require-auth.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

export const deleteController = async ( req: AuthRequest, res: Response ) => {
    const errors = validationResult(req);
        
    if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );
            
    const userId = req?.user?.id;

    if( !userId ) {
        throw new BadRequestError( "User ID is missing!" );
    }

    try {

        await UserModel.delete(userId);
        await DeletedUsersRepo.insert( userId );

        /** KAFKA */
        /**
         * Emit user.registered event
         * This initializes user-related services (profile, settings, etc.)
         * Consumers must be idempotent
         */
        try {
            await publishUserDeleted({
                event_id: uuidv4(),
                event_type: "user.deleted",
                event_version: 1,
                occurred_at: new Date().toISOString(),
                user_id: userId, // req.currentUser!.id
                payload: {
                    reason: "user_requested",
                    deleted_by: "user",
                },
            });
        }
        catch(eventError) {
            console.error( "Kafka publish failed:", eventError );
        }
        /** KAFKA */

        res.status(200).send({
            message: "Account Deletion is successful!",
            user: null
        });
    }
    catch(err) {
        throw err;
    }
};
