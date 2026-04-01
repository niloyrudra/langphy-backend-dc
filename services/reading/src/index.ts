import express from "express";
import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { readingRouter } from "./routes/reading.route.js";
const { json } = pkg;


const app = express();

app.use(cors());
app.use( json() );

app.use( readingRouter );
// app.all( "*", async ( req, res ) => { throw new Error("404!") } );

connectMongo();

const PORT = 4005;
app.listen( PORT, () => console.log( `Reading service listening on port ${PORT}.` ) );