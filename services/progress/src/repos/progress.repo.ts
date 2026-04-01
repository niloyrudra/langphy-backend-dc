import { ProgressModel } from "../models/progress.model.js";

export interface ProgressInput {
    category_id: string;
    unit_id: string;
    user_id: string;
    content_type: string;
    content_id: string;
    session_key: string;
    lesson_order: number;
    completed: boolean;
    score: number;
    duration_ms: number;
    progress_percent: number;
}


export class ProgressRepo {
    static async applyActivity( input: ProgressInput ) {
        try {
            const existing = await ProgressModel.getByUserAndContent( input.user_id, input.content_type, input.content_id );
            
            const progress = await ProgressModel.upsertProgress(input);

            const updated = !existing ||
                            existing.progress_percent !== progress.progress_percent ||
                            existing.completed !== progress.completed ||
                            existing.score !== progress.score;
            
            return {
                updated,
                progress
            }
        }
        catch(error) {
            console.error("ProgressRepo applyActivity error:", error);
            return {
                updated: false,
                progress: null
            }
        }
    }

    static async deleteProgress( user_id: string ) {
        try {
            return await ProgressModel.deleteProgressByUserId( user_id );
        }
        catch(error) {
            console.error( "deleteProgress error:", error );
        }
    }
}