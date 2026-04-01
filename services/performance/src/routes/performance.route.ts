import { Router } from "express";
// import { body } from "express-validator";
import { updatePerformanceController } from "../controllers/performance.controller.js";
import { validation } from "../middlewares/validation.js";
import { requireAuth } from "../middlewares/require-auth.js";

const router = Router();

router.get(
    "/api/performance",
    requireAuth,
    validation,
    updatePerformanceController
);

export { router as PerformanceRouter };