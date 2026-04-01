import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const UserPasswordChangedEventSchema = BaseEventSchema.extend({
    event_type: z.literal("user.password.changed"),
    event_version: z.literal(1),
    payload: z.object({
        forced: z.boolean() // admin reset vs user initiated
    })
});

export type UserPasswordChangedEvent = z.infer<typeof UserPasswordChangedEventSchema>;