import { z } from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const SessionCompletedEventSchema = BaseEventSchema.extend({
    event_type: z.literal("session.completed"),
    event_version: z.literal(1),
    payload: z.object({
        unit_id: z.string(),
        session_type: z.enum([
            "practice",
            "quiz",
            "reading",
            "writing",
            "listening",
            "speaking",
        ]),
        session_key: z.string(),
        total_duration_ms: z.number(),
        score: z.number().optional(),
        attempts: z.number(),
        completed_at: z.number(),
    }),
});

export type SessionCompletedEvent = z.infer<typeof SessionCompletedEventSchema>;