import express from "express";
// import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { practiceRouter } from "./routes/practice.route.js";
const { json } = pkg;


const app = express();

// app.use(cors());
app.use( json() );

app.use( practiceRouter );
// app.all( "*", async ( req, res ) => { throw new Error("404!") } );

connectMongo();

const PORT = 4002;
app.listen( PORT, () => console.log( `Practice service listening on port ${PORT}.` ) );