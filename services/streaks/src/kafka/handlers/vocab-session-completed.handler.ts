import { TOPICS } from "@langphy/shared";
import type { BaseHandler, HandlerContext } from "./base-handler.js";
import { EventIndexModel } from "../../models/eventIndex.model.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";
import { StreakRepo } from "../../repos/streaks.repo.js";
import { producer } from "../producer.js";
import type { VocabSessionCompletedEvent } from "@langphy/shared";
import { randomUUID } from "node:crypto";

const DEFAULT_TZ = "Europe/Berlin";

/**
 * Consumes `vocabulary.session.completed.v1`. On every eligible session:
 *   1. idempotency check (event_inbox + deleted_users)
 *   2. eligibility gate (simple: any vocab session counts)
 *   3. transactional applyActivity
 *   4. emit `streak.updated.v1` if (and only if) something changed
 *   5. mark the source event processed
 *
 * Throws on any failure. The caller (consumer.ts) is responsible for
 * NOT committing the offset on throw.
 */
export class VocabSessionCompletedHandler
    implements BaseHandler<VocabSessionCompletedEvent>
{
    readonly topic = TOPICS.VOCAB_SESSION_COMPLETED;

    async handle(
        event: VocabSessionCompletedEvent,
        _ctx: HandlerContext,
    ): Promise<void> {
        // 1. dedup — re-delivery must not double-apply
        if (await EventIndexModel.exists(event.event_id)) {
            return;
        }

        // 2. skip tombstones — user was deleted
        if (await DeletedUsersRepo.exists(event.user_id)) {
            return;
        }

        // 3. eligibility — any vocab session counts for streak
        //    (could add minimum duration/words filter here if needed)

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