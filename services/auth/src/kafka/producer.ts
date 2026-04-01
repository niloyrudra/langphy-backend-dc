import { TOPICS, type UserDeletedEvent, type UserRegisteredEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";

let producer: ReturnType<typeof kafka.producer> | null = null;

export const initProducer = async () => {
    let retries = 10;
    producer = kafka.producer();

    while (retries > 0) {
        try {
            await producer.connect();
            console.log("✅ Auth Kafka Producer connected");
            return;
        } catch (err: any) {
            console.log("⏳ Auth Kafka not ready, retrying...", err.message);
            retries--;
            await new Promise(res => setTimeout(res, 3000));
        }
    }

    throw new Error("❌ Auth Kafka not ready after retries");
};

const send = async (topic: string, event: { user_id: string }) => {
    if (!producer) throw new Error("Auth Kafka producer not initialized");
    await producer.send({
        topic,
        messages: [{ key: event.user_id, value: JSON.stringify(event) }],
    });
};

// ✅ Each publisher routes to its correct topic explicitly
export const publishUserRegistered = async (event: UserRegisteredEvent) =>
    send(TOPICS.USER_REGISTERED, event);

export const publishUserDeleted = async (event: UserDeletedEvent) =>
    send(TOPICS.USER_DELETED, event);

// ✅ Removed: publishUserSignedOut, publishUserPasswordChanged
// — nobody consumes these events, no reason to produce them

// ✅ Removed: broken generic publishEvent() that always sent to USER_REGISTERED

// ✅ Removed: retry-producer.ts dependency on local topics.ts
// — retry/DLQ not needed for this phase, remove those files from auth service







// import {
//   TOPICS,
//   type BaseEvent,
//   type UserDeletedEvent,
//   // type UserPasswordChangedEvent,
//   type UserRegisteredEvent,
//   // type UserSignedOutEvent
// } from "@langphy/shared";
// import { kafka } from "./kafka.client.js";

// let producer: ReturnType<typeof kafka.producer> | null = null;

// export const initProducer = async () => {
//   let retries = 10;
//   producer = kafka.producer();

//   while (retries > 0) {
//     try {
//       await producer.connect();
//       console.log("Auth Kafka Producer connected successfully!");
//       return;
//     } catch (err: any) {
//       console.log("Auth Kafka Producer not ready, retrying...", err.message);
//       retries--;
//       await new Promise(res => setTimeout(res, 3000));
//     }
//   }

//   throw new Error("❌ Auth Kafka not ready after retries");
// };

// /**
//  * Internal low-level sender
//  */
// export const sendRaw = async (
//   topic: string,
//   key: string,
//   value: unknown
// ): Promise<void> => {
//   if (!producer) {
//     throw new Error("Kafka producer not initialized");
//   }

//   await producer.send({
//     topic,
//     messages: [
//       {
//         key,
//         value: JSON.stringify(value),
//       },
//     ],
//   });
// };

// /**
//  * Generic event publisher
//  * Used by:
//  * - outbox publisher
//  * - retry publisher
//  * - direct publishers (optional)
//  */
// export const publishEvent = async (event: BaseEvent): Promise<void> => {
//   await sendRaw(
//     TOPICS.USER_REGISTERED,
//     event.user_id,
//     event
//   );
// };

// /**
//  * 
//  * @param event 
//  * @returns void
//  */
// const send = async (
//   topic: string,
//   event: BaseEvent
// ) => {
//   if( !producer ) {
//     throw new Error("Kafka producer not initialized");
//   }

//   await producer.send({
//     topic,
//     messages: [
//       {
//         key: event.user_id,
//         value: JSON.stringify(event),
//       },
//     ],
//   });
// };

// /* =====================
//     EVENT PUBLISHERS
// ===================== */

// export const publishUserRegistered = async ( event: UserRegisteredEvent ) => send(TOPICS.USER_REGISTERED, event);

// export const publishUserDeleted = async ( event: UserDeletedEvent ) => send(TOPICS.USER_DELETED, event);

// // export const publishUserSignedOut = async ( event: UserSignedOutEvent ) => send( TOPICS.USER_SIGNED_OUT, event);

// // export const publishUserPasswordChanged = async ( event: UserPasswordChangedEvent ) => send( TOPICS.USER_PASSWORD_CHANGED, event);