import Express from "express";
import "express-async-errors";
import { NotificationRouter } from "./routes/notification.route.js";
import { errorHandler } from "./middlewares/error-handler.js";
import pkg from "body-parser";
import { dbRouter } from "./routes/db-route.js";
import { initProducer } from "./kafka/producer.js";
import { initConsumer } from "./kafka/consumer.js";
import { startDailyReminderJob } from "./jobs/daily-reminder.job.js";
const {json} = pkg;

const app = Express();

app.use( json() );

app.use( dbRouter );
app.use( NotificationRouter );

app.use( errorHandler );

const start = async () => {
    try{
        await initConsumer();
    }
    catch(err) {
        console.log( "Notifications - Kafka consumer failed:", err );
    }
    try{
        await initProducer();
    }
    catch(err) {
        console.log( "Notifications - Kafka producer failed:", err );
    }

    // 👇 START CRON HERE
    startDailyReminderJob();

    const PORT: number = parseInt(process.env.PORT || "4011", 10);
    app.listen( PORT, '::', () => console.log(`Notifications Service is running on port ${PORT}`) );
}
start();