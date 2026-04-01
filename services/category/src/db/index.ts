import mongoose from "mongoose";

export const connectMongo = async () => {
    if( !process.env.CATEGORY_MONGO_URI ) {
        throw new Error( "CATEGORY_MONGO_URI not defined!" );
    }

    await mongoose.connect( process.env.CATEGORY_MONGO_URI );
    console.log( "Connected to Category MongoDB!" );
}