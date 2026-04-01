import mongoose, { Model, Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * 1️⃣ Schema (single source of truth)
 */
const readingLessonSchema = new Schema(
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
        unit_title: {
            type: String,
            required: true
        },
        phrase: {
            type: String,
            required: true
        },
        question_en: {
            type: String,
            required: true
        },
        answer: {
            type: String,
            required: true
        },
        explanation: {
            type: String,
            required: true
        },
        options: {
            type: [String, String, String, String],
            required: true
        }
    },
    {
        collection: "readings",
        timestamps: false
    }
);

/**
 * 2️⃣ Infer TypeScript type directly from schema
 */
export type ReadingLessonDoc = InferSchemaType<typeof readingLessonSchema>;

/**
 * 3️⃣ Typed model
 */
const Reading: Model<ReadingLessonDoc> = mongoose.model<ReadingLessonDoc>(
    "Reading",
    readingLessonSchema
);

export { Reading };