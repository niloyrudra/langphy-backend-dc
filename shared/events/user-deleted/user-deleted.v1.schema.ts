import {z} from "zod";
import { BaseEventSchema } from "../base-event.schema.js";

export const UserDeletedEventSchema = BaseEventSchema.extend({
  event_type: z.literal("user.deleted.v1"),
  event_version: z.literal(1),
  payload: z.object({
    reason: z.string().optional(),
    deleted_by: z.enum(["user", "admin", "system"]),
  }),
});

export type UserDeletedEvent = z.infer<
  typeof UserDeletedEventSchema
>;
