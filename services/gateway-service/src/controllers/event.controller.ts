import type { Response } from "express";
import { BaseEventSchema } from "@langphy/shared";
// import { mapEventToTopic } from "../routes/event.route.js";
import { publishEvent } from "../kafka/producer.js";
import { EventInboxModel } from "../models/eventIndex.model.js";
import type { AuthRequest } from "../middlewares/require-auth.js";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { validationResult } from "express-validator";

export const postEvent = async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    const userId = req.user?.id;
    if (!userId) throw new BadRequestError("User ID is required");
    try {

        // 1️⃣ Validate shape
        const event = BaseEventSchema.parse({
            ...req.body,
            user_id: userId // enforce from auth
        });
    
        // 2️⃣ Idempotency (HTTP-level)
        const alreadyHandled = await EventInboxModel.hasProcessed(event.event_id);
        if ( alreadyHandled ) return res.sendStatus(200);
    
        // 3️⃣ Persist inbox - Store inbox FIRST (critical)
        await EventInboxModel.markProcessed(event);
    
        // 4️⃣ Produce to Kafka
        await publishEvent(event);
    
    //   await producer.send({
    //     topic: mapEventToTopic(event.event_type),
    //     messages: [
    //       {
    //         key: event.user_id,
    //         value: JSON.stringify(event),
    //       },
    //     ],
    //   });
    
        return res.sendStatus(200);
    }
    catch(error: any) {
        console.error( "POST /api/events failed", error );
        // return res.status(400).json({error: "Invalid event"});
        console.error("❌ Event processing failed:", error);

        return res.status(500).json({
            error: "Event processing failed",
            details: error.message,
        });
    }
};