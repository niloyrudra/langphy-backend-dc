import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const UserRegisteredEventSchema = BaseEventSchema.extend({
  event_type: z.literal("user.registered.v1"),
  event_version: z.literal(1),
  payload: z.object({
    email: z.email(), // z.string().email()
    provider: z.enum(["email", "google", "facebook", "apple"]),
    /**
     * Optional IANA timezone string (e.g. "Europe/Berlin") provided by the
     * client at signup time. Downstream services (streaks, notifications)
     * read this so per-user behaviour (e.g. "is it still today for this
     * user?") is correct regardless of server clock.
     *
     * Optional — older clients / future re-deliveries may omit it.
     * Consumers MUST treat absence as "use a sensible default" (UTC for
     * emails, Europe/Berlin for the streaks product).
     */
    timezone: z.string().optional(),
  }),
});

export type UserRegisteredEvent = z.infer<
  typeof UserRegisteredEventSchema
>;
