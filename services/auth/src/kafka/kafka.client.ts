import { createKafkaClient } from "@langphy/shared";
 
export const kafka = createKafkaClient();

// import { Kafka } from "kafkajs";

// export const kafka = new Kafka({
//   clientId: process.env.SERVICE_NAME ?? 'auth-service',
//   brokers: [ process.env.KAFKA_BROKER ?? "kafka:9092"],
//   retry: {
//     initialRetryTime: 300,
//     retries: 10
//   }
// });