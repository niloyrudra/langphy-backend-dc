import { TOPICS, type StreakUpdatedEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";

export const producer = kafka.producer();

export const initProducer = async () => {
    await producer.connect();
    console.log( `[${process.env.SERVICE_NAME!}] Kafka producer connected` );
};

export const shutdownProducer = async () => {
  await producer.disconnect();
  console.log( `[${process.env.SERVICE_NAME!}] Kafka producer disconnected` );
};

export const publishStreakEvent = async ( topic: string, payload: any ) => {
    await producer.send({
        topic,
        messages: [
            {value: JSON.stringify( payload )}
        ]
    });
};

export const publishStreakUpdated = async (event: StreakUpdatedEvent) => {
  await producer.send({
    topic: TOPICS.STREAK_UPDATED,
    messages: [
      { value: JSON.stringify(event) }
    ],
  });
};