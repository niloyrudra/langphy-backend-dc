import type { Request, Response } from "express";
import { Quiz } from "../models/quiz.model.js";

// Get all Quiz lessons
export const getAllQuizzes = async ( _req: Request, res: Response ) => {
    try {
        const allQuizzes = await Quiz.find({})
                                    // .sort({ title: 1 })
                                    .lean();
        
        if (!allQuizzes) {
            return res.status(404).json({ message: "Quizzes not found!" });
        }

        res.status(200).json( allQuizzes );
    }
    catch(err) {
        console.error( "Quiz fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch Quiz lessons!"
        });
    }
};

export const getQuizzesByCategoryAndUnitIds = async ( req: Request, res: Response ) => {
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
        const quizzes = await Quiz.find({categoryId, unitId})
                                    // .sort({ title: 1 })
                                    .lean();
    
        if ( !quizzes ) {
            return res.status(404).json({ message: "Quizzes not found!" });
        }

        res.status(200).json( quizzes );
    }
    catch(err) {
        console.error( "Get Quizzes by ids error:", err );
        res.status(500).json({
            error: "Failed to fetch Quizzes by category and unit ids!"
        });
    }
};