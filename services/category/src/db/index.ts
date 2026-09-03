/**
 * Category MongoDB connection — thin re-export of the shared `connectMongo`.
 * The bootstrap wires it with `CATEGORY_MONGO_URI`.
 */
export { connectMongo } from "@langphy/shared/content";