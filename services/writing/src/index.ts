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

const PORT = 4006;
app.listen( PORT, () => console.log( `Writing service listening on port ${PORT}.` ) );