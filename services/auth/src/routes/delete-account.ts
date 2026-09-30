import { Router } from "express";
import { deleteController } from "../controllers/delete.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { deleteAccountLimiter } from "../middlewares/rate-limit.js";

const router = Router();

router.post(
  "/api/users/delete",
  requireAuth,
  deleteAccountLimiter,
  deleteController
);

export { router as deleteAccountRouter };