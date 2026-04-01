import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { NotificationModel } from "../models/notification.model.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    created_at: string;
    data?: Record<string, any>;
}

export const createNotification = async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if( !errors.isEmpty() ) throw new RequestValidationError(errors.array());
    try {
        const {data} = req.body;
        const notifications = await NotificationModel.upsertNotification( data as Notification );
        return res.status(200).json({
            message: "All notifications",
            notifications
        });
    }
    catch(error) {
        console.error("Notification Model getNotification error:", error);
        throw error;
    }
}

export const getNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if( !errors.isEmpty() ) throw new RequestValidationError(errors.array());
    try {
        const userId = req.user?.id;
        const notifications = await NotificationModel.getUserNotifications( userId as string );
        return res.status(200).json({
            message: "All notifications",
            notifications
        });
    }
    catch(error) {
        console.error("Notification Model getNotification error:", error);
        throw error;
    }
}

export const getNotificationByUserAndType = async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if( !errors.isEmpty() ) throw new RequestValidationError(errors.array());
    try {
        const {userId, type} = req.params;
        if( !userId || !type ) return res.status(400).json({message: "Required data is missing"});

        const notifications = await NotificationModel.getByUserIdAndType( userId as string, type as string );
        return res.status(200).json({
            message: `Fetched notifications based on userId: ${userId} and type: ${type}`,
            notifications
        });
    }
    catch(error) {
        console.error("Notification Model getNotification error:", error);
        throw error;
    }
}