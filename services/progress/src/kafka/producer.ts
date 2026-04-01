import { TOPICS, type BaseEvent, type ProgressUpdatedEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

export let producer: ReturnType<typeof kafka.producer> | null = null;

export const initProducer = async () => {
    let retries = 10;
    producer = kafka.producer();

    while( retries > 0 ) {
        try {
            await producer.connect();
            console.log("Progress - Kafka Produer connected successfully!");
            return;
        }
        catch(err: any) {
            console.log("Progress - Kafka not ready, retrying...", err.message);
            retries--;
            await new Promise( res => setTimeout( res, 3000 ) );
        }
    }

    throw new Error("Progress - Kafka not ready after retries");
};

/**
 * Internal low-level sender
 */
export const sendRaw = async (
    topic: string,
    key: string,
    value: unknown
): Promise<void> => {
    if( !producer ) throw new Error("Progress - Kafka producer not initialized");

    await producer.send({
        topic,
        messages: [
            {
                key,
                value: JSON.stringify( value )
            },
        ],
    });
};

/**
 * Generic event publisher
 * Used by:
 * - outbox publisher
 * - retry publisher
 * - direct publishers (optional)
 */
export const publishEvent = async ( event: BaseEvent ): Promise<void> => {
    await sendRaw(
        TOPICS.PROGRESS_UPDATED,
        event.user_id,
        event
    );
};

/**
 * 
 * @param event
 * @return void
 * 
 */
export const send = async ( event: {user_id: string} ) => {
    if( !producer ) throw new Error(  "Progress - Kafka producer not initialized");
    if( await DeletedUsersRepo.exists( event.user_id ) ) return;

    await producer.send({
        topic: TOPICS.PROGRESS_UPDATED,
        messages: [
            {
                key: event.user_id,
                value: JSON.stringify( event )
            },
        ],
    });
};

/* =====================
    EVENT PUBLISHERS
===================== */
export const publishProgressUpdated = async ( event: ProgressUpdatedEvent ) => send( event );