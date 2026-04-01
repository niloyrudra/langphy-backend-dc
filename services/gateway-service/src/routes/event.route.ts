import { Router } from "express";
import { postEvent } from "../controllers/event.controller.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { errorHandler } from "../middlewares/error-handler.js";

const router = Router();

router.post("/api/events", requireAuth, errorHandler, postEvent);

export { router as eventRouter };