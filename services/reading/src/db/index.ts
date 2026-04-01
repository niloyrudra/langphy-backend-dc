import mongoose from "mongoose";

export const connectMongo = async () => {
    if( !process.env.READING_MONGO_URI ) {
        throw new Error("READING_MONGO_URI not defined!");
    }

    await mongoose.connect( process.env.READING_MONGO_URI );
    console.log("Connected to Reading MongoDB!");
}