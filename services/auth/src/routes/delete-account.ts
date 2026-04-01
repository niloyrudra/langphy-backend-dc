import { Router } from "express";
import { deleteController } from "../controllers/delete.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

router.post(
  "/api/users/delete",
  requireAuth,
  deleteController
);

export { router as deleteAccountRouter };