import { z } from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

/**
 * lesson.completed.v1
 * Emitted whenever a user lessones in learning
 */
export const LessonCompletedEventSchema = BaseEventSchema.extend({
    event_id: z.uuid(),
    event_type: z.literal( "lesson.completed" ),
    event_version: z.literal(1),
    user_id: z.uuid(),
    payload: z.object({
        category_id: z.uuid(),
        unit_id: z.uuid(),
        session_key: z.string(),
        lesson_id: z.uuid(),
        lesson_order: z.number(),
        session_type: z.enum(["quiz",  "practice", "reading", "writing", "speaking", "listening"]),
        completed: z.boolean(),
        duration_ms: z.number(),
        progress_percent: z.number(),
        score: z.number().min(0).max(100).optional()
    })
});

export type LessonCompletedEvent = z.infer<typeof LessonCompletedEventSchema>;