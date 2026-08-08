import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";
import { Password } from "../services/password.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

/** Token TTL — short enough that a stolen token expires before a brute-force
 *  guessing attack against the JWT signing key becomes useful. */
const JWT_EXPIRES_IN = "1h";

export const signinController = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    const { email, password } = req.body;

    const user = await UserModel.findByEmail(email);
    // Single generic "Invalid credentials" message — never leak whether
    // the email exists vs the password is wrong (anti-enumeration).
    if (!user || !user.password) {
        throw new BadRequestError("Invalid credentials");
    }

    if (await DeletedUsersRepo.exists(user.id)) {
        throw new BadRequestError("Invalid credentials");
    }

    const passwordMatch = await Password.compare(user.password, password);
    if (!passwordMatch) {
        throw new BadRequestError("Invalid credentials");
    }

    const userJwt = jwt.sign(
        {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
        },
        process.env.JWT_KEY!,
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).send({
        message: "Signin successful!",
        user: { ...user },
        token: userJwt,
    });
};