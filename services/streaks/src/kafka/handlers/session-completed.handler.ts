import { TOPICS } from "@langphy/shared";
import type { BaseHandler, HandlerContext } from "./base-handler.js";
import { EventIndexModel } from "../../models/eventIndex.model.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { StreakRepo } from "../../repos/streaks.repo.js";
import { StreakModel } from "../../models/streaks.model.js";
import { isEligibleSession } from "../../domain/streak-math.js";
import { randomUUID } from "node:crypto";
import type { SessionCompletedEvent } from "@langphy/shared";
import { producer } from "../producer.js";

const DEFAULT_TZ = "Europe/Berlin";

/**
 * Consumes `session.completed.v1`. On every eligible session:
 *   1. idempotency check (event_inbox + deleted_users)
 *   2. eligibility gate (duration / score / speaking)
 *   3. transactional applyActivity
 *   4. emit `streak.updated.v1` if (and only if) something changed
 *   5. mark the source event processed
 *
 * Throws on any failure. The caller (consumer.ts) is responsible for
 * NOT committing the offset on throw.
 */
export class SessionCompletedHandler
    implements BaseHandler<SessionCompletedEvent>
{
    readonly topic = TOPICS.SESSION_COMPLETED;

    async handle(
        event: SessionCompletedEvent,
        _ctx: HandlerContext,
    ): Promise<void> {
        // 1. dedup — re-delivery must not double-apply
        if (await EventIndexModel.exists(event.event_id)) {
            return;
        }

        // 2. skip tombstones — user was deleted, the handler will run
        //    via user.deleted.v1 instead
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }

        // 3. eligibility — quality gate. Ineligible sessions still mark
        //    the event processed so they aren't re-evaluated.
        if (!isEligibleSession(event.payload)) {
            await EventIndexModel.markProcessed({
                event_id: event.event_id,
                event_type: event.event_type,
                event_version: event.event_version,
                user_id: event.user_id,
                occurred_at: event.occurred_at,
                payload: event.payload,
            });
            return;
        }

        // 4. apply streak math (transactional)
        const result = await StreakRepo.applyActivity({
            userId: event.user_id,
            occurredAt: new Date(event.occurred_at),
        });

        // 5. emit streak.updated only on real change
        if (result.updated) {
            await producer.send({
                topic: TOPICS.STREAK_UPDATED,
                messages: [
                    {
                        key: event.user_id,
                        value: JSON.stringify({
                            event_id: randomUUID(),
                            event_type: TOPICS.STREAK_UPDATED,
                            event_version: 1,
                            occurred_at: new Date().toISOString(),
                            user_id: event.user_id,
                            payload: {
                                current_streak: result.currentStreak,
                                longest_streak: result.longestStreak,
                                last_activity_date:
                                    result.lastActivityDate ?? null,
                                celebration: result.celebration,
                                is_active: result.is_active,
                            },
                        }),
                    },
                ],
            });
        }

        // 6. mark processed (last — if we threw earlier, the offset is
        //    not committed and the whole message will be redelivered)
        await EventIndexModel.markProcessed({
            event_id: event.event_id,
            event_type: event.event_type,
            event_version: event.event_version,
            user_id: event.user_id,
            occurred_at: event.occurred_at,
            payload: event.payload,
        });
    }
}

/**
 * Helper for keeping the timezone fresh when we have no user.registered
 * event yet (e.g. if a session arrives before the registration
 * envelope, which shouldn't happen but defensive code is cheap).
 */
export async function syncUserTimezoneFromRegistered(
    userId: string,
    timezone: string | undefined,
): Promise<void> {
    if (!timezone) return;
    await StreakModel.setUserTimezone(userId, timezone || DEFAULT_TZ);
}
