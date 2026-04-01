import { Router } from "express";
import { getAllListeningLessons, getListeningLessonsByCategoryAndUnitIds } from "../controllers/listening.controller.js";

const router = Router();

router.get( "/api/listening", getAllListeningLessons );
router.get( "/api/listening/:categoryId/:unitId", getListeningLessonsByCategoryAndUnitIds );

export { router as listeningRouter };