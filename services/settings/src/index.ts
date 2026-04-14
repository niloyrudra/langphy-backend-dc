import Express from "express";
import "express-async-errors";
import { SettingsRouter } from "./routes/settings.route.js";
import { errorHandler } from "./middlewares/error-handler.js";
import pkg from "body-parser";
import { dbRouter } from "./routes/db-route.js";
import { initSettingsConsumers } from "./kafka/consumer.js";
const {json} = pkg;
// import cors from 'cors';

const app = Express();

app.use( json() );

app.use( dbRouter );
app.use( SettingsRouter );

app.use( errorHandler );

const start = async () => {
    try {
        await initSettingsConsumers();
        console.log("Kafka Setting Consumer connected successfully!");
    }
    catch(err) {
        console.error("Settings Kafka failed:", err);
    }
    
    const PORT: number = parseInt(process.env.PORT || "3005", 10);
    app.listen( PORT, '::', () => console.log(`Settings Service is running on port ${PORT}`) );
}

start();