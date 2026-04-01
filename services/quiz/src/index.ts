import express from "express";
// import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { quizRouter } from "./routes/quiz.route.js";
const { json } = pkg;


const app = express();

// app.use(cors());
app.use( json() );

app.use( quizRouter );
// app.all( "*", async ( req, res ) => { throw new Error("404!") } );

connectMongo();

const PORT = 4003;
app.listen( PORT, () => console.log( `Quiz service listening on port ${PORT}.` ) );