import { Router } from "express";
import { body } from "express-validator";
import { validateAuth } from "../middlewares/validate-auth.js";
import { resetPasswordController } from "../controllers/reset-password.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { resetPwLimiter } from "../middlewares/rate-limit.js";

const router = Router();

router.put(
    "/api/users/profile/reset-password",
    requireAuth,
    resetPwLimiter,
    [
        body("password")
            .trim()
            .isLength({ min: 8, max: 72 })
            .withMessage("Password must be between 8 and 72 characters"),
    ],
    validateAuth,
    resetPasswordController
);

export { router as resetPasswordByEmailRouter };