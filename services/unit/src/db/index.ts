import mongoose from "mongoose";

export const connectMongo = async () => {
    if( !process.env.UNIT_MONGO_URI ) {
        throw new Error("UNIT_MONGO_URI not defined!");
    }

    await mongoose.connect( process.env.UNIT_MONGO_URI );
    console.log("Connected to Unit MongoDB!");
}