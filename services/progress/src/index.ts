import Express from "express";
import "express-async-errors";
import { ProgressRouter } from "./routes/progress.route.js";
import { errorHandler } from "./middlewares/error-handler.js";
import pkg from "body-parser";
import { dbRouter } from "./routes/db-route.js";
import { initConsumer } from "./kafka/consumer.js";
import { initProducer } from "./kafka/producer.js";
import { VocabularyRouter } from "./routes/vocabulary.route.js";
const {json} = pkg;
// import cors from 'cors';

const app = Express();

app.use( json() );

app.use( dbRouter );
app.use( ProgressRouter );
app.use( VocabularyRouter );

app.use( errorHandler );

const start = async () => {

    try{
        await initConsumer();
        await initProducer();
    }
    catch(err) {
        console.log( "PRogress - Kafka producer failed:", err );
    }
    
    const PORT: number = parseInt(process.env.PORT || "3002", 10);
    app.listen( PORT, '::', () => console.log(`Progress Service is running on port ${PORT}`) );
}
start();