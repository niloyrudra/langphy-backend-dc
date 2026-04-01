import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const ReminderTriggeredEventSchema = BaseEventSchema.extend({
    event_type: z.literal("reminder.triggered.v1"),
    event_version: z.literal(1),
    payload: z.object({
        title: z.string(),
        body: z.string(),
        read: z.boolean(),
        created_at: z.string(),
        data: z.record(z.string(), z.any()).optional()
    })
});

export type ReminderTriggeredEvent = z.infer<typeof ReminderTriggeredEventSchema>;