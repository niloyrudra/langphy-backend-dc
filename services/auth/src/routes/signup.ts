import { Router } from "express";
import { body } from 'express-validator';
import { requestOtpController, signupController, verifyOtpController } from "../controllers/signup.controller.js";
import { validateAuth } from "../middlewares/validate-auth.js";

const router = Router();

// routes/signup.route.ts
router.post(
    "/api/users/signup/request-otp",
    [
        body("email").isEmail().withMessage("Email must be valid!"),
        body("password").trim().isLength({ min: 4, max: 20 })
            .withMessage("Password must be between 4 and 20 characters"),
    ],
    validateAuth,
    requestOtpController
);

router.post(
    "/api/users/signup/verify-otp",
    [
        body("email").isEmail().withMessage("Email must be valid!"),
        body("password").trim().isLength({ min: 4, max: 20 })
            .withMessage("Password must be between 4 and 20 characters"),
        body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    ],
    validateAuth,
    verifyOtpController
);

router.post(
    "/api/users/signup",
    [
        body('email')
            .isEmail()
            .withMessage('Email must be valid!'),
        body('password')
            .trim()
            .isLength({
                min: 4,
                max: 20
            })
            .withMessage('Password must be between 4 and 20 characters')
    ],
    validateAuth,
    signupController
);

export { router as signUpRouter };