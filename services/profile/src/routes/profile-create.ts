import { Router, type NextFunction, type Request, type Response } from "express";
import { createProfileController } from "../controllers/profile.controller.js";
import { body, validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";

const router = Router();

router.post(
    "/api/profile/create",
    requireAuth,
    [
        body('username')
            .trim()
            .notEmpty()
            .withMessage("Username must be provided"),
        body('first_name')
            .trim()
            .isLength({
                min: 2,
                max: 30
            })
            .withMessage('Password must be between 2 and 30 characters'),
        body("last_name")
            .trim()
            .isLength({
                min: 2,
                max: 30
            })
            .withMessage('Password must be between 2 and 30 characters')  
    ],
    async (req: AuthRequest, _res: Response, next: NextFunction) => {
        const errors = validationResult( req );
        
        if (!errors.isEmpty()) {
            throw new RequestValidationError(errors.array());
        }
        next();
    },
    createProfileController
);

export { router as ProfileCreationRouter };