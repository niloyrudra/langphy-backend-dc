import express from "express";
// import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { categoryRouter } from "./routes/category.route.js";
const { json } = pkg;


const app = express();

// app.use(cors());
app.use( json() );

app.use( categoryRouter );
app.all( "*", async ( req, res ) => { throw new Error("404!") } );

connectMongo();

const PORT = 4000;
app.listen( PORT, () => console.log( `Category service listening on port ${PORT}.` ) );