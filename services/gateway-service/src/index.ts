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
  const PORT: number = parseInt(process.env.PORT || "3009", 10);
  app.listen( PORT, '::', () => console.log(`Gateway Service running on port ${PORT}`));
};

start();