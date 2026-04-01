import { Router } from "express";
import { body } from "express-validator";

import {
    upsertProgressController,
    getUserProgressController,
    bulkSyncProgressController,
} from "../controllers/progress.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { errorHandler } from "../middlewares/error-handler.js";

const router = Router();

router.post(
    "/api/progress",
    requireAuth,
    [
        body("category_id").notEmpty(),
        body("unit_id").notEmpty(),
        body("user_id").notEmpty(),
        body("content_type").notEmpty(),
        body("content_id").notEmpty(),
        body("progress_percent").isFloat({ min: 0, max: 100 }),
    ],
    errorHandler,
    upsertProgressController
);

router.get(
    "/api/progress",
    requireAuth,
    errorHandler,
    getUserProgressController
);

// ✅ Bulk Sync
router.post(
  "/api/progress/bulk-sync",
  requireAuth,
  errorHandler,
  bulkSyncProgressController
);

export { router as ProgressRouter };