import { Router } from "express";
import { body } from "express-validator";
import { signinController } from "../controllers/signin.controller.js";
import { validateAuth } from "../middlewares/validate-auth.js";

const router = Router();

router.post(
  "/api/users/signin",
  [
    body("email")
      .isEmail()
      .withMessage("Email must be valid"),
    body("password")
      .trim()
      .notEmpty()
      .withMessage("Password must be supplied")
  ],
  validateAuth,
  signinController
);

export { router as signInRouter };