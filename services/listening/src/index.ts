import express from "express";
import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { listeningRouter } from "./routes/listening.route.js";
const { json } = pkg;


const app = express();

app.use(cors());
app.use( json() );

app.use( listeningRouter );

connectMongo();

const PORT: number = parseInt(process.env.PORT || "4007", 10);
app.listen( PORT, '::', () => console.log( `Listening service listening on port ${PORT}.` ) );