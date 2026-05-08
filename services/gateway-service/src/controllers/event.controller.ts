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
    
        // TEMPORARY: log full payload structure to diagnose
        console.log("[Gateway] event.payload keys:", 
            event.payload ? Object.keys(event.payload as object) : "null/undefined"
        );
        console.log("[Gateway] event.payload sample:", 
            JSON.stringify(event.payload).slice(0, 200)
        );

        // 2️⃣ Idempotency (HTTP-level)
        const alreadyHandled = await EventInboxModel.hasProcessed(event.event_id);
        if ( alreadyHandled ) return res.sendStatus(200);
    

        /**
         * Temporary workaround for client-side issue where events are sent with an extra "data" wrapper. We will remove this once the client is updated to send the correct shape without the "data" wrapper.
         * 
         * If the event has a "data" property, we will extract the actual event from it and re-validate the shape. This allows us to handle both the old and new event shapes during the transition period.
         */
        // The client stores the full envelope as the payload field.
        // Unwrap until we reach the actual inner payload (no more nested envelope keys).
        // while (
        //     finalPayload &&
        //     typeof finalPayload === "object" &&
        //     "payload" in finalPayload
        //     // &&
        //     // ("event_id" in finalPayload || "event_type" in finalPayload)
        // ) {
        //     console.log(`[Gateway] Unwrapping nested envelope for ${event.event_type}`);
        //     finalPayload = finalPayload.payload;
        // }
      
        
        let finalPayload = event.payload as any;
        while (
            finalPayload &&
            typeof finalPayload === "object" &&
            "payload" in finalPayload
        ) {
            console.log(`[Gateway] Unwrapping nested envelope for ${event.event_type}`);
            finalPayload = finalPayload.payload;
        }
        
        // After the unwrap loop, normalize camelCase → snake_case for known fields
        if (finalPayload && typeof finalPayload === "object") {
            finalPayload = {
                ...finalPayload,
                // existing normalizations
                unit_id:      finalPayload.unit_id      ?? finalPayload.unitId,
                user_id:      finalPayload.user_id      ?? finalPayload.userId,
                lesson_id:    finalPayload.lesson_id    ?? finalPayload.lessonId,
                category_id:  finalPayload.category_id  ?? finalPayload.categoryId,
                session_type: finalPayload.session_type ?? finalPayload.sessionType,
                // new normalizations
                total_duration_ms: finalPayload.total_duration_ms ?? finalPayload.duration_ms,
                completed_at:      finalPayload.completed_at      ?? finalPayload.occurredAt,
            };
            // clean up camelCase originals
            delete finalPayload.unitId;
            delete finalPayload.userId;
            delete finalPayload.lessonId;
            delete finalPayload.categoryId;
            delete finalPayload.sessionType;
            delete finalPayload.duration_ms;
            delete finalPayload.occurredAt;
        }


        /**
         * By normalizing the event payload before idempotency check and persistence, we ensure that we are checking and storing the correct event shape. This way, even if the client sends the wrong shape, we can still process it correctly without causing duplicates or errors in our inbox model.
         */
        // ✅ Reconstruct the FULL envelope with unwrapped payload
        const normalizedEvent = {
            event_id: event.event_id,
            event_type: event.event_type,
            event_version: event.event_version,
            user_id: event.user_id,
            occurred_at: event.occurred_at,
            payload: finalPayload  // ✅ Use the unwrapped payload
        };
        // const normalizedEvent = { ...event, payload: finalPayload };
        
        console.log("[Gateway] finalPayload sample:", 
            JSON.stringify(finalPayload).slice(0, 200)
        );

        console.log("[Gateway] normalizedEvent.payload sample:", 
            JSON.stringify(normalizedEvent.payload).slice(0, 200)
        );

        // 3️⃣ Persist inbox - Store inbox FIRST (critical)
        await EventInboxModel.markProcessed(normalizedEvent);
    
        // 4️⃣ Produce to Kafka
        await publishEvent(normalizedEvent);
        
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

// Previous version that will be replace the current one which is temporarily solve a client side issue with the event shape. We will remove this code once the client is updated to send the correct shape without the "data" wrapper.
// export const postEvent = async (req: AuthRequest, res: Response) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

//     const userId = req.user?.id;
//     if (!userId) throw new BadRequestError("User ID is required");
//     try {

//         // 1️⃣ Validate shape
//         const event = BaseEventSchema.parse({
//             ...req.body,
//             user_id: userId // enforce from auth
//         });
    
//         // 2️⃣ Idempotency (HTTP-level)
//         const alreadyHandled = await EventInboxModel.hasProcessed(event.event_id);
//         if ( alreadyHandled ) return res.sendStatus(200);
    
//         // 3️⃣ Persist inbox - Store inbox FIRST (critical)
//         await EventInboxModel.markProcessed(event);
    
//         // 4️⃣ Produce to Kafka
//         await publishEvent(event);
    
//     //   await producer.send({
//     //     topic: mapEventToTopic(event.event_type),
//     //     messages: [
//     //       {
//     //         key: event.user_id,
//     //         value: JSON.stringify(event),
//     //       },
//     //     ],
//     //   });
    
//         return res.sendStatus(200);
//     }
//     catch(error: any) {
//         console.error( "POST /api/events failed", error );
//         // return res.status(400).json({error: "Invalid event"});
//         console.error("❌ Event processing failed:", error);

//         return res.status(500).json({
//             error: "Event processing failed",
//             details: error.message,
//         });
//     }
// };