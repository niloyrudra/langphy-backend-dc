import express from "express";
import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { writingRouter } from "./routes/writing.route.js";
const { json } = pkg;


const app = express();

app.use(cors());
app.use( json() );

app.use( writingRouter );

connectMongo();

const PORT: number = parseInt(process.env.PORT || "4006", 10);
app.listen( PORT, '::', () => console.log( `Writing service listening on port ${PORT}.` ) );