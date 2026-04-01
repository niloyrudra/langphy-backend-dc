import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const NotificationCreatedSchema = BaseEventSchema.extend({
    event_type: z.literal("notification.created.v1"),
    event_version: z.literal(1),
    payload: z.object({
        title: z.string(),
        body: z.string(),
        read: z.boolean(),
        created_at: z.string(),
        data: z.record(z.string(), z.any()).optional() // key: string, value: any
    })
});

export type NotificationCreatedEvent = z.infer<typeof NotificationCreatedSchema>;