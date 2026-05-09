import { z } from "zod";

/**
 * progress.updated.v1
 * Emitted whenever a user progresses in learning
 */
export const ProgressUpdatedEventSchema = z.object({
    event_id: z.uuid(),
    event_type: z.literal( "progress.updated.v1" ),
    event_version: z.literal(1),
    occurred_at: z.string().datetime(),
    user_id: z.uuid(),
    payload: z.object({
        category_id: z.string(), // z.uuid(),
        unit_id: z.string(), // z.uuid(),
        session_key: z.string(),
        lesson_id: z.string(), // z.uuid(),
        session_type: z.enum(["quiz",  "practice", "reading", "writing", "speaking", "listening"]),
        lesson_order: z.number().default(0),
        completed: z.boolean().default(false),
        duration_ms: z.number().default(0),
        progress_percent: z.number().min(0).max(100).default(0),
        score: z.number().min(0).max(100).optional().default(0)
    })
});

export type ProgressUpdatedEvent = z.infer<typeof ProgressUpdatedEventSchema>;