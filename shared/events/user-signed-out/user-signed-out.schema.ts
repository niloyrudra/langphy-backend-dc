import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const UserSignedOutEventSchema = BaseEventSchema.extend({
    event_type: z.literal("user.signed_out"),
    event_version: z.literal(1),
    payload: z.object({
        session_id: z.string(),
        device: z.string().optional()
    })
});

export type UserSignedOutEvent = z.infer<typeof UserSignedOutEventSchema>;