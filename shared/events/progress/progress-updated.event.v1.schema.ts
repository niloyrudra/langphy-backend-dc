import { z } from "zod";

/**
 * progress.updated.v1
 * Emitted whenever a user progresses in learning
 */
export const ProgressUpdatedEventSchema = z.object({
    event_id: z.uuid(),
    event_type: z.literal( "progress.updated" ),
    event_version: z.literal(1),
    occurred_at: z.string().datetime(),
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

export type ProgressUpdatedEvent = z.infer<typeof ProgressUpdatedEventSchema>;