import { z } from "zod";

/**
 * streak.updated.v1
 * Emitted whenever a user's streak changes
 */
export const StreakUpdatedEventSchema = z.object({
  event_id: z.uuid(),
  event_type: z.literal("streak.updated"),
  event_version: z.literal(1),
  occurred_at: z.string().datetime(),
  user_id: z.uuid(),
  payload: z.object({
    current_streak: z.number().int().nonnegative(),
    longest_streak: z.number().int().nonnegative(),
    last_activity_date: z.string().datetime().nullable(),
    is_active: z.boolean(),
  }),
});

export type StreakUpdatedEvent = z.infer<
  typeof StreakUpdatedEventSchema
>;