// ─────────────────────────────────────────────────────────────────────────────
// Single Kafka client factory used by ALL services.
// Import in each service:
//   import { createKafkaClient } from "@langphy/shared";
//
// Local/Railway dev: KAFKA_SASL_USERNAME not set → plain TCP to kafka:9092
// Managed Kafka (Confluent/Upstash/…): if REAL SASL creds are provided →
// SASL_PLAIN + TLS.
//
// Placeholder safety: values like "dummy" or "change-me" are treated as NOT
// configured — past bug: someone filled KAFKA_SASL_* with placeholder strings
// and KafkaJS enabled SASL+SSL against a plaintext KRaft broker, silently
// breaking every producer/consumer.
// ─────────────────────────────────────────────────────────────────────────────

import { Kafka, type KafkaConfig } from "kafkajs";

/**
 * Well-known placeholder values users paste into KAFKA_SASL_* while "trying
 * things". Matching creds are ignored so the default (plaintext, local/
 * in-cluster KRaft) connection keeps working. Real usernames like
 * "dummy-corp-user" do NOT match (anchored, case-insensitive).
 */
const SASL_PLACEHOLDER =
    /^(dummy|changeme|change-me|placeholder|your-username|your-password|xxx|REPLACE_WITH_[A-Z0-9_]+)$/i;

export const createKafkaClient = (serviceName?: string): Kafka => {
    const broker = process.env.KAFKA_BROKER ?? "kafka:9092";
    const username = (process.env.KAFKA_SASL_USERNAME ?? "").trim();
    const password = (process.env.KAFKA_SASL_PASSWORD ?? "").trim();
    const name = serviceName || process.env.SERVICE_NAME || "langphy-service";

    // Exactly ONE credential set → almost certainly a misconfiguration.
    // Don't guess: warn loudly and fall back to plaintext.
    if ((username.length > 0) !== (password.length > 0)) {
        console.warn(
            `[${name}] WARNING: only one of KAFKA_SASL_USERNAME/KAFKA_SASL_PASSWORD is set — SASL is DISABLED (plaintext). Set both or neither.`
        );
    }

    const hasRealCredentials =
        username.length > 0 &&
        password.length > 0 &&
        !SASL_PLACEHOLDER.test(username) &&
        !SASL_PLACEHOLDER.test(password);

    const sasl: Partial<KafkaConfig> = hasRealCredentials
        ? {
              ssl: true,
              sasl: {
                  mechanism: "plain" as const,
                  username,
                  password,
              },
          }
        : {};

    if (hasRealCredentials) {
        console.log(`[${name}] Kafka: SASL/SSL enabled (user "${username}")`);
    } else {
        console.log(`[${name}] Kafka: connecting PLAINTEXT to ${broker}`);
    }

    return new Kafka({
        clientId: name,
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