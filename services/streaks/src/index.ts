process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    process.exit(1); // Let Railway restart the container cleanly
});

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
    process.exit(1); // Same here
});

import Express from "express";
import "express-async-errors";
import { StreaksRouter } from "./routes/streaks.js";
import { errorHandler } from "./middlewares/error-handler.js";
import pkg from "body-parser";
import { dbRouter } from "./routes/db-route.js";
import { startKafka } from "./kafka/index.js";
const {json} = pkg;

const app = Express();

app.use( json() );

app.use( dbRouter );
app.use( StreaksRouter );

app.use( errorHandler );

const start = async () => {

    try {
        await startKafka();
    }
    catch(err) {
        console.error("Streaks - 'startKafka' failed to initiate");
    }

    const PORT: number = parseInt(process.env.PORT || "3001", 10);
    app.listen( PORT, '::', () => console.log(`Streaks Service is running on port ${PORT}`) );

}

start();