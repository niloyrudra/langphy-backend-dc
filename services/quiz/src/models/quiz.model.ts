import { createContentModel } from "@langphy/shared/content";

/**
 * Quiz schema — the service-specific part. The schema fields stay here;
 * the active-collection pointer + `InferSchemaType`/`model<>` boilerplate now
 * live in the shared `createContentModel` factory.
 */
export const Quiz = createContentModel({
    modelName: "Quiz",
    collectionEnv: "QUIZ_COLLECTION",
    defaultCollection: "quizzes",
    timestamps: false,
    fields: {
        // _id: default Mongoose ObjectId (live data stores ObjectId; keep default)
        categoryId: {
            type: String,
            required: true,
        },
        unitId: {
            type: String,
            required: true,
        },
        unit_title: {
            type: String,
            required: true,
        },
        level: {
            type: String,
            required: true,
        },
        difficulty: {
            type: String,
            required: true,
        },
        question: {
            type: String,
            required: true,
        },
        answer: {
            type: String,
            required: true,
        },
        answer_explanation: {
            type: String,
            required: true,
        },
        options: {
            type: [String, String, String, String],
            required: true,
        },
    },
});