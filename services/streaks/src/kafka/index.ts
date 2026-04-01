import { initProducer, producer } from "./producer.js";
import { initConsumer, consumer } from "./consumer.js";

// Readiness flag for Kubernetes
export let kafkaReady = false;

export async function startKafka() {
  try {
    await initProducer();
    await initConsumer();
    kafkaReady = true;
    console.log("✅ Kafka subsystem ready");
  } catch (err) {
    kafkaReady = false;
    console.error("❌ Kafka failed to start:", err);
    throw err; // Let server handle retries or crash
  }
}

export async function stopKafka() {
  kafkaReady = false;
  try {
    // Assume you export producer/consumer objects
    await producer.disconnect();
    await consumer.disconnect();
    console.log("✅ Kafka subsystem stopped");
  } catch (err) {
    console.error("❌ Error stopping Kafka:", err);
  }
}