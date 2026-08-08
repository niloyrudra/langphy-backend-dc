import { Router } from "express";
import { body } from "express-validator";
import {
    requestOtpController,
    verifyOtpController,
} from "../controllers/signup.controller.js";
import { validateAuth } from "../middlewares/validate-auth.js";
import {
    signupOtpLimiter,
    verifyOtpLimiter,
} from "../middlewares/rate-limit.js";

const router = Router();

router.post(
    "/api/users/signup/request-otp",
    signupOtpLimiter,
    [
        body("email").isEmail().withMessage("Email must be valid!"),
        body("password")
            .trim()
            .isLength({ min: 8, max: 72 }) // 72 = bcrypt's input limit
            .withMessage("Password must be between 8 and 72 characters"),
    ],
    validateAuth,
    requestOtpController
);

router.post(
    "/api/users/signup/verify-otp",
    verifyOtpLimiter,
    [
        body("email").isEmail().withMessage("Email must be valid!"),
        body("password")
            .trim()
            .isLength({ min: 8, max: 72 })
            .withMessage("Password must be between 8 and 72 characters"),
        body("otp")
            .isLength({ min: 6, max: 6 })
            .isNumeric()
            .withMessage("OTP must be 6 digits"),
    ],
    validateAuth,
    verifyOtpController
);

export { router as signUpRouter };