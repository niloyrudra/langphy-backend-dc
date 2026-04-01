import { Router } from "express";
import { getAllWritingLessons, getWritingLessonsByCategoryAndUnitIds } from "../controllers/writing.controller.js";

const router = Router();

router.get( "/api/writng", getAllWritingLessons );
router.get( "/api/writing/:categoryId/:unitId", getWritingLessonsByCategoryAndUnitIds );

export { router as writingRouter };