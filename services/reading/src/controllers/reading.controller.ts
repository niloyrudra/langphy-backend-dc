import type { Request, Response } from "express";
import { Reading } from "../models/reading.model.js";

// Get all Speaking lessons
export const getAllReadingLessons = async ( _req: Request, res: Response ) => {
    try {
        const allReadingLessons = await Reading.find({})
                                    // .sort({ german_level: 1 })
                                    .lean();
        
        if (!allReadingLessons) {
            return res.status(404).json({ message: "Reading Lessons not found!" });
        }

        res.status(200).json( allReadingLessons );
    }
    catch(err) {
        console.error( "Reading lessons fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch Reading lessons!"
        });
    }
};

export const getReadingLessonsByCategoryAndUnitIds = async ( req: Request, res: Response ) => {
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
        const readingLessons = await Reading.find({categoryId, unitId})
                                    // .sort({ german_level: 1 })
                                    .lean();
    
        if ( !readingLessons ) {
            return res.status(404).json({ message: "Reading Lessons not found!" });
        }

        res.status(200).json( readingLessons );
    }
    catch(err) {
        console.error( "Get Reading Lessons by ids error:", err );
        res.status(500).json({
            error: "Failed to fetch Reading Lessons by category and unit ids!"
        });
    }
};