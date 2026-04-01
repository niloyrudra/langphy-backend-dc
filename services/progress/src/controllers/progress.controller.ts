import type { Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { ProgressModel } from "../models/progress.model.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

export const upsertProgressController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    try {
        const {
            category_id,
            unit_id,
            user_id,
            content_type,
            content_id,
            session_key,
            lesson_order,
            completed,
            score,
            duration_ms,
            progress_percent,
        } = req.body;

        if (!user_id || !content_type || !content_id) {
            throw new BadRequestError("Missing required fields");
        }

        const progress = await ProgressModel.upsertProgress({
            category_id,
            unit_id,
            user_id,
            content_type,
            content_id,
            session_key,
            lesson_order,
            completed,
            score,
            duration_ms,
            progress_percent,
        }); // TO-DO

        /**
         * KAFKA
         * 
         * Emit progress.updated event
         * This intialized progress-related services (performance, achievements, etc.)
         * Consumer must be idempotent
         */
        // try {
        //     await publishProgressUpdated({
        //         event_id: uuidv4(),
        //         event_type: "progress.updated",
        //         event_version: 1,
        //         occurred_at: new Date().toISOString(),
        //         user_id: user_id,
        //         payload: {
        //             category_id,
        //             unit_id,
        //             lesson_id: content_id,
        //             lesson_type: content_type,
        //             completed,
        //             progress_percent,
        //             score
        //         }
        //     });
        // }
        // catch(eventError) {
        //     console.error("Progress Kafka publish failed:", eventError);
        // }

        res.status(200).send({
            message: "Progress saved successfully",
            progress,
        });
    } catch (err) {
        console.error("Upsert progress error:", err);
        next(err);
    }
};

export const getUserProgressController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError("User ID is required");
        }
        const user_id = typeof userId == 'string' ? userId : '';
        const progress = await ProgressModel.getUserProgress(user_id);

        res.status(200).send({
            message: "Progress data",
            progress,
        });
    } catch (err) {
        console.error("Get user progress error:", err);
        next(err);
    }
};

export const bulkSyncProgressController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        console.log("Incoming progress payload:", JSON.stringify(req.body, null, 2));

        const userId = req.user?.id;
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                message: "Items array is required",
            });
        }

        const results = await Promise.all(
            items.map(item =>
                ProgressModel.upsertProgress({
                    category_id: item.category_id,
                    unit_id: item.unit_id,
                    user_id: userId as string,
                    content_type: item.content_type,
                    content_id: item.content_id,
                    session_key: item.session_key,
                    lesson_order: item.lesson_order ?? 0,
                    completed: item.completed,
                    score: item.score ?? 0,
                    duration_ms: item.duration_ms ?? 0,
                    progress_percent: item.progress_percent ?? 0,
                })
            )
        );

        return res.status(200).json({
            message: "Bulk sync successful",
            count: results.length,
        });
    } catch (error) {
        console.error("bulkSyncProgressController error:", error);
        return res.status(500).json({
            message: "Bulk sync failed",
        });
    }
};