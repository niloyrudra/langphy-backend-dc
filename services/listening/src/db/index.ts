import mongoose from "mongoose";

export const connectMongo = async () => {
    if( !process.env.LISTENING_MONGO_URI ) {
        throw new Error("LISTENING_MONGO_URI not defined!");
    }

    await mongoose.connect( process.env.LISTENING_MONGO_URI );
    console.log("Connected to Listening MongoDB!");
}