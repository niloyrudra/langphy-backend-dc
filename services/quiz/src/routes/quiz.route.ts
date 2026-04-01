import { Router } from "express";
import { getAllQuizzes, getQuizzesByCategoryAndUnitIds } from "../controllers/quiz.controller.js";

const router = Router();

router.get( "/api/quizzes", getAllQuizzes );
router.get( "/api/quizzes/:categoryId/:unitId", getQuizzesByCategoryAndUnitIds );

export { router as quizRouter };