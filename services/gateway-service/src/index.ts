import express from "express";
import { eventRouter } from "./routes/event.route.js";
import { initProducer } from "./kafka/producer.js";

const app = express();

app.use(express.json());

app.use(eventRouter);

const start = async () => {
  try {
    await initProducer();   // 🔑 once at boot
  }
  catch(error) {
    console.error("Gateway - Kafka initProducer failed", error)
  }
  app.listen(3009, () => console.log("Gateway Service running on port 3009"));
};

start();