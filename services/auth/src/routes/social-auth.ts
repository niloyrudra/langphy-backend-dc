import { Router } from "express";
import { body } from "express-validator";
import { socialAuthController } from "../controllers/social-auth.controller.js";
import { validateAuth } from "../middlewares/validate-auth.js";
import { socialAuthLimiter } from "../middlewares/rate-limit.js";

const router = Router();

router.post(
    "/api/users/social-auth",
    socialAuthLimiter,
    [
        body("provider")
            .isIn(["google", "facebook"])
            .withMessage("Unsupported provider"),
        body("access_token")
            .isString()
            .isLength({ min: 10, max: 4096 })
            .withMessage("Invalid access token"),
        body("profile").isObject().withMessage("Profile required"),
        body("profile.id").isString().isLength({ min: 1, max: 256 }),
        body("profile.email").optional({ nullable: true }).isString().isLength({ max: 320 }),
        body("profile.name").optional({ nullable: true }).isString().isLength({ max: 256 }),
        body("profile.picture").optional({ nullable: true }).isURL().isLength({ max: 2048 }),
    ],
    validateAuth,
    socialAuthController
);

export { router as socialAuthRouter };