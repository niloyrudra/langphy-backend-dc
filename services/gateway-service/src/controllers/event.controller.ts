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
        // console.log("[Gateway] event.payload keys:", 
        //     event.payload ? Object.keys(event.payload as object) : "null/undefined"
        // );
        // console.log("[Gateway] event.payload sample:", 
        //     JSON.stringify(event.payload).slice(0, 200)
        // );

        // 2️⃣ Idempotency (HTTP-level)
        const alreadyHandled = await EventInboxModel.hasProcessed(event.event_id);
        if ( alreadyHandled ) return res.sendStatus(200);
    

        /**
         * Temporary workaround for client-side issue where events are sent with an extra "data" wrapper. We will remove this once the client is updated to send the correct shape without the "data" wrapper.
         * 
         * If the event has a "data" property, we will extract the actual event from it and re-validate the shape. This allows us to handle both the old and new event shapes during the transition period.
         */
        // Detect and unwrap double-nested envelope from current client bug
        // let finalPayload = event.payload;
        // if (
        //     finalPayload &&
        //     typeof finalPayload === "object" &&
        //     "event_type" in finalPayload &&
        //     "payload" in finalPayload
        // ) {
        //     // Client sent the full envelope as payload — extract the real inner payload
        //     finalPayload = (finalPayload as any).payload;
        // }

        // Replace your current unwrapping block with this:
        let finalPayload = event.payload as any;

        // The client stores the full envelope as the payload field.
        // Unwrap until we reach the actual inner payload (no more nested envelope keys).
        while (
            finalPayload &&
            typeof finalPayload === "object" &&
            "payload" in finalPayload &&
            ("event_id" in finalPayload || "event_type" in finalPayload)
        ) {
            console.log(`[Gateway] Unwrapping nested envelope for ${event.event_type}`);
            finalPayload = finalPayload.payload;
        }

        const normalizedEvent = { ...event, payload: finalPayload };
        /**
         * By normalizing the event payload before idempotency check and persistence, we ensure that we are checking and storing the correct event shape. This way, even if the client sends the wrong shape, we can still process it correctly without causing duplicates or errors in our inbox model.
         */

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