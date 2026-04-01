import mongoose from "mongoose";

export const connectMongo = async () => {
    if( !process.env.SPEAKING_MONGO_URI ) {
        throw new Error("SPEAKING_MONGO_URI not defined!");
    }

    await mongoose.connect( process.env.SPEAKING_MONGO_URI );
    console.log("Connected to Speaking MongoDB!");
}