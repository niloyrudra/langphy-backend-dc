import Express from "express";
import "express-async-errors";
import { ProgressRouter } from "./routes/progress.route.js";
import { errorHandler } from "./middlewares/error-handler.js";
import pkg from "body-parser";
import { dbRouter } from "./routes/db-route.js";
import { initConsumer } from "./kafka/consumer.js";
import { initProducer } from "./kafka/producer.js";
const {json} = pkg;
// import cors from 'cors';

const app = Express();

app.use( json() );

app.use( dbRouter );
app.use( ProgressRouter );

app.use( errorHandler );

const start = async () => {

    try{
        await initConsumer();
        await initProducer();
    }
    catch(err) {
        console.log( "PRogress - Kafka producer failed:", err );
    }
    app.listen( 3002, () => console.log("Progress Service is running on port 3002") );
}
start();