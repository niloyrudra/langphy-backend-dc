import { createContentModel } from "@langphy/shared/content";

/**
 * Reading lesson schema — the service-specific part. The schema fields stay
 * here; the active-collection pointer + `InferSchemaType`/`model<>` boilerplate
 * now live in the shared `createContentModel` factory.
 */
export const Reading = createContentModel({
    modelName: "Reading",
    collectionEnv: "READING_COLLECTION",
    defaultCollection: "readings",
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
        phrase: {
            type: String,
            required: true,
        },
        question_en: {
            type: String,
            required: true,
        },
        answer: {
            type: String,
            required: true,
        },
        explanation: {
            type: String,
            required: true,
        },
        options: {
            type: [String, String, String, String],
            required: true,
        },
    },
});