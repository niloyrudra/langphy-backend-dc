import { z } from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const VocabAchievementUnlockedEventSchema = BaseEventSchema.extend({
    event_type: z.literal("vocabulary.achievement.unlocked.v1"),
    event_version: z.literal(1),
    payload: z.object({
        achievement_code: z.string(),
        achievement_name: z.string(),
        xp_reward: z.number().int().nonnegative(),
        unlocked_at: z.coerce.date(),
    }),
});

export type VocabAchievementUnlockedEvent = z.infer<typeof VocabAchievementUnlockedEventSchema>;