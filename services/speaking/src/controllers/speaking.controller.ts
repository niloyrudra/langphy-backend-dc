import type { Request, Response } from "express";
import { Speaking } from "../models/speaking.model.js";

// Get all Quiz lessons
export const getAllSpeakingLessons = async ( _req: Request, res: Response ) => {
    try {
        const allSpeakingLessons = await Speaking.find({})
                                    // .sort({ german_level: 1 })
                                    .lean();
        
        if (!allSpeakingLessons) {
            return res.status(404).json({ message: "Speaking Lessons not found!" });
        }

        res.status(200).json( allSpeakingLessons );
    }
    catch(err) {
        console.error( "Speaking lessons fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch Speaking lessons!"
        });
    }
};

export const getSpeakingLessonsByCategoryAndUnitIds = async ( req: Request, res: Response ) => {
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
        const speakingLessons = await Speaking.find({categoryId, unitId})
                                    // .sort({ german_level: 1 })
                                    .lean();
    
        if ( !speakingLessons ) {
            return res.status(404).json({ message: "Speaking Lessons not found!" });
        }

        res.status(200).json( speakingLessons );
    }
    catch(err) {
        console.error( "Get Speaking Lessons by ids error:", err );
        res.status(500).json({
            error: "Failed to fetch Speaking Lessons by category and unit ids!"
        });
    }
};