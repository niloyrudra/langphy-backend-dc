import type { Request, Response } from "express";
import { Practice } from "../models/practice.model.js";

// Get all Practice lessons
export const getAllPracticeLessons = async ( _req: Request, res: Response ) => {
    try {
        const allPracticeLessons = await Practice.find({})
                                    .sort({ title: 1 })
                                    .lean();
        
        if (!allPracticeLessons) {
            return res.status(404).json({ message: "Practice lessons not found!" });
        }

        res.status(200).json( allPracticeLessons );
    }
    catch(err) {
        console.error( "Practice lessons fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch Practice lessons!"
        });
    }
};

export const getPracticeLessonsByCategoryAndUnitIds = async ( req: Request, res: Response ) => {
    const { categoryId, unitId } = req.params;

    if( !categoryId || typeof categoryId !== 'string' ) {
        return res.status(400).json({
            message: "Invalid Category Id!"
        });
    }
    if( !unitId || typeof unitId !== 'string' ) {
        return res.status(400).json({
            message: "Invalid Unit Id!"
        });
    }

    try {
        const practiceLessons = await Practice.find({categoryId, unitId})
                                    .sort({ title: 1 })
                                    .lean();
    
        if ( !practiceLessons ) {
            return res.status(404).json({ message: "Practice lessons not found!" });
        }

        res.status(200).json( practiceLessons );
    }
    catch(err) {
        console.error( "Get Practice lessons by ids error:", err );
        res.status(500).json({
            error: "Failed to fetch Practice lessons by category and unit ids!"
        });
    }
};