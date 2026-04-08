import type { Kafka } from "kafkajs";
import { createKafkaClient } from "@langphy/shared";
 
export const kafka: Kafka = createKafkaClient();