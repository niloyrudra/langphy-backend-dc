import { z } from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const VocabWordMasteredEventSchema = BaseEventSchema.extend({
    event_type: z.literal("vocabulary.word.mastered.v1"),
    event_version: z.literal(1),
    payload: z.object({
        lemma: z.string(),
        pos: z.string(),
        meaning_en: z.string().nullable(),
        repetitions: z.number().int().nonnegative(),
        ease_factor: z.number(),
        mastered_at: z.coerce.date(),
    }),
});

export type VocabWordMasteredEvent = z.infer<typeof VocabWordMasteredEventSchema>;