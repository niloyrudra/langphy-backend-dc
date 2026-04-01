import mongoose, { Model, Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * 1️⃣ Schema (single source of truth)
 */
const practiceSchema = new Schema(
    {
        _id: {
            type: String,
            required: true
        },
        categoryId: {
            type: String,
            required: true
        },
        unitId: {
            type: String,
            required: true
        },
        title: {
            type: String,
            required: true
        },
        slug: {
            type: String,
            required: true
        },
    },
    {
        collection: "practices",
        timestamps: false
    }
);

/**
 * 2️⃣ Infer TypeScript type directly from schema
 */
export type PracticeDoc = InferSchemaType<typeof practiceSchema>;

/**
 * 3️⃣ Typed model
 */
const Practice: Model<PracticeDoc> = mongoose.model<PracticeDoc>(
    "Practice",
    practiceSchema
);

export { Practice };