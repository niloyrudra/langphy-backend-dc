import mongoose, { Model, Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * 1️⃣ Schema (single source of truth)
 */
const quizSchema = new Schema(
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
        level: {
            type: String,
            required: true
        },
        difficulty: {
            type: String,
            required: true
        },
        question: {
            type: String,
            required: true
        },
        answer: {
            type: String,
            required: true
        },
        answer_explanation: {
            type: String,
            required: true
        },
        options: {
            type: [String, String, String, String],
            required: true
        },
    },
    {
        collection: "quizzes",
        timestamps: false
    }
);

/**
 * 2️⃣ Infer TypeScript type directly from schema
 */
export type QuizDoc = InferSchemaType<typeof quizSchema>;

/**
 * 3️⃣ Typed model
 */
const Quiz: Model<QuizDoc> = mongoose.model<QuizDoc>(
    "Quiz",
    quizSchema
);

export { Quiz };