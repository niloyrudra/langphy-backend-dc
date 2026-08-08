import type { Response } from "express";
import { UserModel } from "../models/user.model.js";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

/**
 * Change password for the currently authenticated user.
 *
 * The JWT identifies the user — we never trust a `email` field in the body
 * to look up the account. This avoids:
 *   - privilege escalation (user A resets user B's password by sending
 *     a different email in the body)
 *   - email enumeration via differential error messages
 */
export const resetPasswordController = async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    const user_id = req.user?.id;
    if (!user_id) {
        throw new BadRequestError("User is not authorized");
    }

    const { password } = req.body as { password: string };

    await UserModel.resetPasswordByUserId(user_id, password);

    res.status(200).json({ message: "Password changed successfully!" });
};