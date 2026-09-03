/**
 * Reading MongoDB connection — thin re-export of the shared `connectMongo`.
 * The bootstrap wires it with `READING_MONGO_URI`.
 */
export { connectMongo } from "@langphy/shared/content";