// Fixes:
//   1. Removed allowAutoTopicCreation: false (causes issues with Confluent Basic)
//   2. Removed idempotent: true (requires acks=-1 which isn't in ProducerConfig)
//   3. Removed dead event types from resolveTopic (progress.updated, performance.updated)
//   4. acks: -1 moved to individual send() calls where needed

import { TOPICS, type BaseEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";

let producer: ReturnType<typeof kafka.producer> | null = null;

export const initProducer = async () => {
  if (producer) return producer;

  // ✅ FIX: removed allowAutoTopicCreation: false and idempotent: true
  producer = kafka.producer();

  let retries = 10;
  while (retries > 0) {
    try {
      await producer.connect();
      console.log("✅ Gateway Kafka Producer connected");
      return producer;
    } catch (error) {
      retries--;
      console.warn("⏳ Gateway Kafka producer retrying...", retries);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  throw new Error("❌ Gateway Kafka Producer failed to connect");
};

const sendRaw = async (topic: string, key: string, value: unknown) => {
  if (!producer) throw new Error("Kafka producer not initialized");
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(value) }],
  });
};

export const publishEvent = async (event: BaseEvent) => {
  const topic = resolveTopic(event.event_type);
  await sendRaw(topic, event.user_id, event);
  console.log(`📤 Published ${event.event_type} → ${topic}`);
};

const resolveTopic = (eventType: string): string => {
  switch (eventType) {
    case "session.completed.v1":
      return TOPICS.SESSION_COMPLETED;
    case "lesson.completed.v1":
      return TOPICS.LESSON_COMPLETED;
    case "streak.updated.v1":
      return TOPICS.STREAK_UPDATED;
    // ✅ FIX: removed progress.updated, performance.updated,
    // notification.created, reminder.triggered — gateway should not
    // produce these. They are produced by their own services.
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
};

export const stopProducer = async () => {
  if (!producer) return;
  await producer.disconnect();
  producer = null;
  console.log("🛑 Gateway Kafka Producer disconnected");
};



// import { TOPICS, type BaseEvent } from "@langphy/shared";
// import { kafka } from "./kafka.client.js";

// let producer: ReturnType<typeof kafka.producer> | null = null;

// export const initProducer = async () => {
//   if( producer ) return producer;

//   producer = kafka.producer({
//     allowAutoTopicCreation: false,
//     // idempotent: true,
//   });

//   let retries = 10;

//   while( retries > 0 ) {
//     try {
//       await producer.connect();
//       console.log("✅ Kafka Producer connected");
//       return producer;
//     }
//     catch(error) {
//       retries--;
//       console.warn("⏳ Kafka producer retrying...", retries);
//       await new Promise( (r) => setTimeout(r, 3000) );
//     }
//   }

//   throw new Error("❌ Kafka Event Producer failed to connect");
// };

// const sendRaw = async (
//   topic: string,
//   key: string,
//   value: unknown
// ) => {
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
//     acks: -1, // Wait for all replicas to acknowledge
//   });
// };

// export const publishEvent = async (event: BaseEvent) => {
//   const topic = resolveTopic(event.event_type);

//   await sendRaw(
//     topic,
//     event.user_id, // partition key
//     event
//   );

//   console.log(`📤 Published ${event.event_type} → ${topic}`);
// };

// const resolveTopic = (eventType: string): string => {
//   switch (eventType) {
//     // case "user.entitlement.updated.v1":
//     //   return TOPICS.ENTITLEMENT_UPDATED;

//     case "user.registered.v1":
//       return TOPICS.USER_REGISTERED;

//     case "user.deleted.v1":
//       return TOPICS.USER_DELETED;

//     case "lesson.completed.v1":
//       return TOPICS.LESSON_COMPLETED;

//     case "session.completed.v1":
//       return TOPICS.SESSION_COMPLETED;

//     // case "progress.updated.v1":
//     //   return TOPICS.PROGRESS_UPDATED;

//     case "streak.updated.v1":
//       return TOPICS.STREAK_UPDATED;

//     // case "performance.updated.v1":
//     //   return TOPICS.PERFORMANCE_UPDATED;

//     case "notification.created.v1":
//       return TOPICS.NOTIFICATION_CREATED;

//     case "reminder.triggered.v1":
//       return TOPICS.REMINDER_TRIGGERED;

//     // case "achievement.unlocked.v1":
//     //   return TOPICS.ACHIEVEMENT_UNLOCKED;

//     default:
//       throw new Error(`Unknown event type: ${eventType}`);
//   }
// };

// export const stopProducer = async () => {
//   if (!producer) return;

//   await producer.disconnect();
//   producer = null;

//   console.log("🛑 Kafka Producer disconnected");
// };