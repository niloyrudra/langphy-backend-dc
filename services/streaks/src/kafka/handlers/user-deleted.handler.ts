import { TOPICS, type UserDeletedEvent } from "@langphy/shared";
import type { BaseHandler, HandlerContext } from "./base-handler.js";
import { EventIndexModel } from "../../models/eventIndex.model.js";
import { StreakRepo } from "../../repos/streaks.repo.js";

/**
 * Consumes `user.deleted.v1`. Removes the user's streak row and writes
 * a tombstone (deleted_users) in a single transaction, then marks the
 * event processed.
 *
 * Idempotent: re-delivery is safe (ON CONFLICT DO NOTHING on
 * deleted_users, plus the row is already gone).
 */
export class UserDeletedHandler implements BaseHandler<UserDeletedEvent> {
    readonly topic = TOPICS.USER_DELETED;

    async handle(
        event: UserDeletedEvent,
        _ctx: HandlerContext,
    ): Promise<void> {
        if (await EventIndexModel.exists(event.event_id)) {
            return;
        }

        await StreakRepo.deleteStreakWithTombstone(
            event.user_id,
            {
                event_id: event.event_id,
                event_type: event.event_type,
                event_version: event.event_version,
                occurred_at: event.occurred_at,
                user_id: event.user_id,
                payload: event.payload,
            },
        );
    }
}
