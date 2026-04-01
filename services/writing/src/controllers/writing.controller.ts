import type { Request, Response } from "express";
import { Writing } from "../models/writing.model.js";

// Get all Speaking lessons
export const getAllWritingLessons = async ( _req: Request, res: Response ) => {
    try {
        const allWritingLessons = await Writing.find({})
                                    // .sort({ german_level: 1 })
                                    .lean();
        
        if (!allWritingLessons) {
            return res.status(404).json({ message: "Writing Lessons not found!" });
        }

        res.status(200).json( allWritingLessons );
    }
    catch(err) {
        console.error( "Writing lessons fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch Writing lessons!"
        });
    }
};

export const getWritingLessonsByCategoryAndUnitIds = async ( req: Request, res: Response ) => {
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
        const writingLessons = await Writing.find({categoryId, unitId})
                                    // .sort({ german_level: 1 })
                                    .lean();
    
        if ( !writingLessons ) {
            return res.status(404).json({ message: "Writing Lessons not found!" });
        }

        res.status(200).json( writingLessons );
    }
    catch(err) {
        console.error( "Get Writing Lessons by ids error:", err );
        res.status(500).json({
            error: "Failed to fetch Writing Lessons by category and unit ids!"
        });
    }
};