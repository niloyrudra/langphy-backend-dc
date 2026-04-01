import { Router } from "express";
import { updateProfileController } from "../controllers/profile.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

router.put(
    "/api/profile/update",
    requireAuth,
    updateProfileController
);

export { router as ProfileUpdateRouter };