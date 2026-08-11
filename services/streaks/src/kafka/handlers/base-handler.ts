import { TOPICS, type UserDeletedEvent, type SessionCompletedEvent } from "@langphy/shared";

/**
 * Shared Kafka context passed to every handler. The consumer fills in
 * the message coordinates so a handler can `commitOffsets` after a
 * successful run.
 */
export interface HandlerContext {
    topic: string;
    partition: number;
    offset: string;
}

export interface BaseHandler<TEvent> {
    /** Topic name this handler subscribes to. */
    readonly topic: string;

    /**
     * Process the event. Throw on any failure — the consumer will
     * NOT commit the offset, so the message will be redelivered.
     * Return normally on success (including idempotent no-op skips).
     */
    handle(event: TEvent, ctx: HandlerContext): Promise<void>;
}

/**
 * Type re-exports so handlers can declare their event payload type.
 */
export type SessionHandler = BaseHandler<SessionCompletedEvent>;
export type UserDeletedHandler = BaseHandler<UserDeletedEvent>;

export { TOPICS };
