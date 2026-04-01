import { Router } from "express";
import { getProfileController } from "../controllers/profile.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

router.get(
    "/api/profile",
    requireAuth,
    getProfileController
);

export { router as ProfileRouter };