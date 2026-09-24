// ─────────────────────────────────────────────────────────────────────────────
// Single Kafka client factory used by ALL services.
// Import in each service:
//   import { createKafkaClient } from "@langphy/shared";
//
// Local/Railway dev: KAFKA_SASL_USERNAME not set → plain TCP to kafka:9092
// Future: If SASL env vars provided → SASL_PLAIN + TLS (for managed Kafka)
// ─────────────────────────────────────────────────────────────────────────────

import { Kafka, type KafkaConfig } from "kafkajs";

export const createKafkaClient = (serviceName?: string): Kafka => {
    const broker = process.env.KAFKA_BROKER ?? "kafka:9092";
    const username = process.env.KAFKA_SASL_USERNAME;
    const password = process.env.KAFKA_SASL_PASSWORD;

    const sasl: Partial<KafkaConfig> = username && password
        ? {
            ssl: true,
            sasl: {
                mechanism: "plain" as const,
                username,
                password,
            },
        }
        : {};

    return new Kafka({
        clientId: serviceName || process.env.SERVICE_NAME || "langphy-service",
        brokers: [broker],
        ...sasl,
        retry: {
            initialRetryTime: 300,
            retries: 10,
        },
        connectionTimeout: 10000,
        requestTimeout: 30000,
    });
};