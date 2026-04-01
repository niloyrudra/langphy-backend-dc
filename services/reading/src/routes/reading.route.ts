import { Router } from "express";
import { getAllReadingLessons, getReadingLessonsByCategoryAndUnitIds } from "../controllers/reading.controller.js";

const router = Router();

router.get( "/api/reading", getAllReadingLessons );
router.get( "/api/reading/:categoryId/:unitId", getReadingLessonsByCategoryAndUnitIds );

export { router as readingRouter };