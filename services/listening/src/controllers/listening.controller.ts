import type { Request, Response } from "express";
import { Listening } from "../models/listening.model.js";

// Get all Speaking lessons
export const getAllListeningLessons = async ( _req: Request, res: Response ) => {
    try {
        const allListeningLessons = await Listening.find({})
                                    // .sort({ german_level: 1 })
                                    .lean();
        
        if (!allListeningLessons) {
            return res.status(404).json({ message: "Listening Lessons not found!" });
        }

        res.status(200).json( allListeningLessons );
    }
    catch(err) {
        console.error( "Listening lessons fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch Listening lessons!"
        });
    }
};

export const getListeningLessonsByCategoryAndUnitIds = async ( req: Request, res: Response ) => {
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
        const listeningLessons = await Listening.find({categoryId, unitId})
                                    // .sort({ german_level: 1 })
                                    .lean();
    
        if ( !listeningLessons ) {
            return res.status(404).json({ message: "Listening Lessons not found!" });
        }

        res.status(200).json( listeningLessons );
    }
    catch(err) {
        console.error( "Get Listening Lessons by ids error:", err );
        res.status(500).json({
            error: "Failed to fetch Listening Lessons by category and unit ids!"
        });
    }
};