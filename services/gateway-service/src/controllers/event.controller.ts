import type { Response } from "express";
import { BaseEventSchema, SessionCompletedEventSchema, LessonCompletedEventSchema } from "@langphy/shared";
import { publishEvent } from "../kafka/producer.js";
import { EventInboxModel } from "../models/eventIndex.model.js";
import type { AuthRequest } from "../middlewares/require-auth.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { validationResult } from "express-validator";
import { normalizeEvent } from "../utils/normalize-event.js";

export const postEvent = async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new RequestValidationError(errors.array());
    }

    const userId = req.user?.id;
    if (!userId) {
        throw new BadRequestError("User ID is required");
    }

    try {
        // 1️⃣ Validate shape
        const event = BaseEventSchema.parse({
            ...req.body,
            user_id: userId, // enforce from auth
        });

        // 2️⃣ Normalize event (unwrap nested payloads, camelCase → snake_case)
        const normalizedEvent = normalizeEvent(event);

        console.log("[Gateway] normalizedEvent:", {
            event_id: normalizedEvent.event_id,
            event_type: normalizedEvent.event_type,
            user_id: normalizedEvent.user_id,
            payloadKeys: Object.keys(normalizedEvent.payload as object),
        });

        // 3️⃣ Idempotency (HTTP-level)
        const alreadyHandled = await EventInboxModel.hasProcessed(normalizedEvent.event_id);
        if (alreadyHandled) {
            return res.sendStatus(200);
        }

        // 4️⃣ Persist inbox - Store inbox FIRST (critical for idempotency)
        await EventInboxModel.markProcessed(normalizedEvent);

        // 5️⃣ Produce to Kafka
        await publishEvent(normalizedEvent);

        return res.sendStatus(200);
    } catch (error: any) {
        // Zod validation errors should be 400
        if (error.name === "ZodError") {
            console.error("❌ Event validation failed:", error.errors);
            throw new BadRequestError("Invalid event payload");
        }

        console.error("❌ Event processing failed:", error);
        throw error; // Let errorHandler handle it (500)
    }
};