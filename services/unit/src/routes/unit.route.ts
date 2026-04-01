import { Router } from "express";
import { getUnits, getUnitsByCategoryId } from "../controllers/unit.controller.js";

const router = Router();

router.get( "/api/unit", getUnits );
router.get( "/api/unit/:categoryId", getUnitsByCategoryId );

export { router as unitRouter };