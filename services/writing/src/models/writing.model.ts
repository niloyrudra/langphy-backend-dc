import mongoose, { Model, Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * 1️⃣ Schema (single source of truth)
 */
const writingLessonSchema = new Schema(
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
        phrase: {
            type: String,
            required: true
        },
        meaning: {
            type: String,
            required: true
        },
        german_level: {
            type: String,
            required: true
        },
        formality: {
            type: String,
            required: true
        },
        region: {
            type: String,
            required: true
        },
        usage_context: {
            type: String,
            required: true
        }
    },
    {
        collection: "writings",
        timestamps: false
    }
);

/**
 * 2️⃣ Infer TypeScript type directly from schema
 */
export type WritingLessonDoc = InferSchemaType<typeof writingLessonSchema>;

/**
 * 3️⃣ Typed model
 */
const Writing: Model<WritingLessonDoc> = mongoose.model<WritingLessonDoc>(
    "Writing",
    writingLessonSchema
);

export { Writing };