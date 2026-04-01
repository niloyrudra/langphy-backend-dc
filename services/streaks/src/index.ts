import Express from "express";
import "express-async-errors";
import { StreaksRouter } from "./routes/streaks.js";
import { errorHandler } from "./middlewares/error-handler.js";
import pkg from "body-parser";
import { dbRouter } from "./routes/db-route.js";
// import { initProducer, shutdownProducer } from "./kafka/producer.js";
// import { initConsumer } from "./kafka/consumer.js";
import { startKafka } from "./kafka/index.js";
const {json} = pkg;
// import cors from 'cors';

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

    app.listen( 3001, () => console.log("Streaks Service is running on port 3001") );

}

start();