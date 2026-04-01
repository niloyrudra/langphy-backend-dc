import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const UserRegisteredEventSchema = BaseEventSchema.extend({
  event_type: z.literal("user.registered.v1"),
  event_version: z.literal(1),
  payload: z.object({
    email: z.email(), // z.string().email()
    provider: z.enum(["email", "google", "facebook", "apple"]),
  }),
});

export type UserRegisteredEvent = z.infer<
  typeof UserRegisteredEventSchema
>;
