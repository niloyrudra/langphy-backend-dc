import express from "express";
import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { speakingRouter } from "./routes/speaking.route.js";
const { json } = pkg;


const app = express();

app.use(cors());
app.use( json() );

app.use( speakingRouter );
// app.all( "*", async ( req, res ) => { throw new Error("404!") } );

connectMongo();

const PORT = 4004;
app.listen( PORT, () => console.log( `Speaking service listening on port ${PORT}.` ) );