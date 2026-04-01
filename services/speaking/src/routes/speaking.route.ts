import { Router } from "express";
import { getAllSpeakingLessons, getSpeakingLessonsByCategoryAndUnitIds } from "../controllers/speaking.controller.js";

const router = Router();

router.get( "/api/speaking", getAllSpeakingLessons );
router.get( "/api/speaking/:categoryId/:unitId", getSpeakingLessonsByCategoryAndUnitIds );

export { router as speakingRouter };