import express from "express";
import "express-async-errors";
import pkg from 'body-parser';
// import { currentUserRouter } from "./routes/current-user.js";
import { signInRouter } from "./routes/signin.js";
import { signOutRouter } from "./routes/signout.js";
import { signUpRouter } from "./routes/signup.js";
const { json } = pkg;
import { errorHandler } from "./middlewares/error-handler.js";
// import { NotFoundError } from "./errors/no-find-errors.js";
import { dbRouter } from "./routes/db-route.js";
import { initProducer } from "./kafka/producer.js";
import { resetPasswordByEmailRouter } from "./routes/reset-password.js";
import { deleteAccountRouter } from "./routes/delete-account.js";

const app = express();

app.use( json() );

app.use( dbRouter );
// app.use( currentUserRouter );
app.use( signInRouter );
app.use( signOutRouter );
app.use( signUpRouter );
app.use( resetPasswordByEmailRouter );
app.use( deleteAccountRouter );

app.use( errorHandler );

const start = async () => {
  try {
    await initProducer();
    console.log("Kafka Auth Producer connected successfully!");
  } catch (err) {
    console.warn("Kafka Producer failed to connect, continuing without Kafka:", err);
  }

  const PORT: number = parseInt(process.env.PORT || "3000", 10);
  app.listen( PORT, '::', () => {
    console.log(`Auth Service listening to port ${PORT}`);
    console.log("KAFKA_BROKER:", process.env.KAFKA_BROKER);
  });
};

// call the async start function
start();