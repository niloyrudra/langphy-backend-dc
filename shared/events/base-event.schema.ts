import { z } from "zod";

export const BaseEventSchema = z.object({
  event_id: z.uuid(),
  event_type: z.string(),
  event_version: z.number().int().positive(),
  occurred_at: z.string().datetime(),
  user_id: z.uuid(),
  payload: z.any(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;