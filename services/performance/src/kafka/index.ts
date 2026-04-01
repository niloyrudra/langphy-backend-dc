import { initConsumer, stopConsumer } from "./consumer.js";

export async function startKafka() {
  console.log("🔌 Starting Performance Kafka subsystem");
  await initConsumer();
  console.log("✅ Performance Kafka ready");
}

export async function stopKafka() {
  console.log("🛑 Stopping Performance Kafka subsystem");
  await stopConsumer();
}