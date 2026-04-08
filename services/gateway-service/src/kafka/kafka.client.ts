import type { Kafka } from "kafkajs";
import { createKafkaClient } from "@langphy/shared";
 
export const kafka: Kafka = createKafkaClient();

// import { Kafka } from "kafkajs";

// export const kafka = new Kafka({
//   clientId: process.env.SERVICE_NAME ?? 'gateway-service',
//   brokers: [ process.env.KAFKA_BROKER ?? "kafka-srv:9092"],
//   retry: {
//     initialRetryTime: 300,
//     retries: 10
//   }
// });