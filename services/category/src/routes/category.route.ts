import { Router } from "express";
import { getCategories, getCategoryById } from "../controllers/category.controller.js";

const router = Router();

router.get( "/api/category", getCategories );
router.get( "/api/category/:id", getCategoryById );

export { router as categoryRouter };