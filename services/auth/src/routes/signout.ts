import { Router } from "express";
import { signoutController } from "../controllers/signout.controller.js";
// import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

// router.post("/api/users/signout", requireAuth, signoutController);
router.post("/api/users/signout", signoutController);

export { router as signOutRouter };

