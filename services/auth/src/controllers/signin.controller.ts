import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";
import { DatabaseConnectionErrors } from "../errors/database-connection-errors.js";
import { Password } from "../services/password.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

export const signinController = async ( req: Request, res: Response ) => {
    const errors = validationResult(req);
    if( !errors.isEmpty() ) throw new RequestValidationError( errors.array() );
    
    const { email, password } = req.body;

    try {
        const user = await UserModel.findByEmail( email );

        if (!user || !user.password) {
            throw new BadRequestError("Invalid credentials");
        }

        const isDeleted = await DeletedUsersRepo.exists(user.id);

        if (isDeleted) {
            throw new BadRequestError("Account has been deleted.");
        }

        const passwordMatch = await Password.compare( user.password, password );

        // if( !passwordMatch ) return res.status(401).send({ error: "Invalid credentials" });
        if( !passwordMatch ) {
            throw new BadRequestError( "Invalid credentials");
        }

        const userJwt = jwt.sign(
            {
                id: user.id,
                email: user.email,
                created_at: user.created_at
            },
            process.env.JWT_KEY!
        );

        res.status(200).send({
            message: "Signin successful!",
            user: {...user},
            token: userJwt
        });
    }
    catch( err ) {
        console.error( "Signin error: ", err );
        throw new DatabaseConnectionErrors();
    }
}