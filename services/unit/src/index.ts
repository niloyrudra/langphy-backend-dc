import express from "express";
// import cors from "cors";
import pkg from "body-parser";
import { connectMongo } from "./db/index.js";
import { unitRouter } from "./routes/unit.route.js";
const { json } = pkg;


const app = express();

// app.use(cors());
app.use( json() );

app.use( unitRouter );

// app.all( "*", async ( req, res ) => { throw new Error("404!") } );
app.all("*", (_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

connectMongo();

const PORT: number = parseInt(process.env.PORT || "4001", 10);
app.listen( PORT, '::', () => console.log( `Unit service listening on port ${PORT}.` ) );