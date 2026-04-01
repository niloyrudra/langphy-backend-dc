import { Router } from "express";
import { getAllPracticeLessons, getPracticeLessonsByCategoryAndUnitIds } from "../controllers/practice.controller.js";

const router = Router();

router.get( "/api/practices", getAllPracticeLessons );
router.get( "/api/practices/:categoryId/:unitId", getPracticeLessonsByCategoryAndUnitIds );

export { router as practiceRouter };