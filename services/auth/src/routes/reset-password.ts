import { Router } from "express";
import { body } from 'express-validator';
import { validateAuth } from "../middlewares/validate-auth.js";
import { resetPasswordByEmailController, resetPasswordController } from "../controllers/reset-password.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

router.put(
    "/api/users/reset-password",
    requireAuth,
    [
        body('email')
            .isEmail()
            .withMessage('Email must be valid!'),
        body('password')
            // .notEmpty()
            .trim()
            .isLength({
                min: 6,
                max: 20
            })
            .withMessage('Password must be between 6 and 20 characters')
    ],
    validateAuth,
    resetPasswordByEmailController
);

router.put(
    "/api/users/profile/reset-password",
    requireAuth,
    [
        body('password')
            // .notEmpty()
            .trim()
            .isLength({
                min: 6,
                max: 20
            })
            .withMessage('Password must be between 6 and 20 characters')
    ],
    validateAuth,
    resetPasswordController
);

export { router as resetPasswordByEmailRouter };