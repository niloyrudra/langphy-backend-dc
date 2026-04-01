import { z } from "zod";

/**
 * settings.updated.v1
 * Emitted whenever a user's settings changes
 */
export const SettingsUpdatedEventSchema = z.object({
  event_id: z.uuid(),
  event_type: z.literal("settings.updated"),
  event_version: z.literal(1),
  occurred_at: z.string().datetime(),
  user_id: z.uuid(),
  payload: z.object({
    sound_effect: z.boolean(),
    theme: z.enum([
      "light",
      "dark"
    ]),
    speaking_service: z.boolean(),
    reading_service: z.boolean(),
    listening_service: z.boolean(),
    writing_service: z.boolean(),
    practice_service: z.boolean(),
    quiz_service: z.boolean(),
    notifications: z.boolean(),
    language: z.enum([
      "en"
    ]),
  }),
});

export type SettingsUpdatedEvent = z.infer<
  typeof SettingsUpdatedEventSchema
>;