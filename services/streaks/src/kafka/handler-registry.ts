import { TOPICS } from "@langphy/shared";
import type {
    BaseHandler,
    HandlerContext,
} from "./handlers/base-handler.js";
import { SessionCompletedHandler } from "./handlers/session-completed.handler.js";
import { UserDeletedHandler } from "./handlers/user-deleted.handler.js";

/**
 * Topic → handler dispatch table. Mirrors the shape used by
 * services/notification/src/application/handle.registry.ts.
 *
 * To subscribe to a new topic:
 *   1. Add a handler class implementing `BaseHandler<T>` in `handlers/`.
 *   2. Register it here.
 *   3. Add the topic to the consumer's subscribe list in `consumer.ts`.
 */
export const topicHandlerMap: Record<string, BaseHandler<any>> = {
    [TOPICS.SESSION_COMPLETED]: new SessionCompletedHandler(),
    [TOPICS.USER_DELETED]: new UserDeletedHandler(),
};

export type { HandlerContext, BaseHandler } from "./handlers/base-handler.js";
