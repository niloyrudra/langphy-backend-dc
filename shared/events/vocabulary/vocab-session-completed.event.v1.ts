import { z } from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const VocabSessionCompletedEventSchema = BaseEventSchema.extend({
    event_type: z.literal("vocabulary.session.completed.v1"),
    event_version: z.literal(1),
    payload: z.object({
        session_id: z.uuid(),
        mode: z.enum(["flashcard", "typing", "audio", "mixed"]),
        words_total: z.number().int().positive(),
        words_correct: z.number().int().nonnegative(),
        duration_ms: z.number().int().positive(),
        xp_earned: z.number().int().nonnegative(),
        new_words_learned: z.number().int().nonnegative(),
        completed_at: z.coerce.date(),
    }),
});

export type VocabSessionCompletedEvent = z.infer<typeof VocabSessionCompletedEventSchema>;