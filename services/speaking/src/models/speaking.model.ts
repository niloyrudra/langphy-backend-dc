import { createContentModel } from "@langphy/shared/content";

/**
 * Speaking lesson schema — the service-specific part. The schema fields stay
 * here; the active-collection pointer + `InferSchemaType`/`model<>` boilerplate
 * now live in the shared `createContentModel` factory.
 */
export const Speaking = createContentModel({
    modelName: "Speaking",
    collectionEnv: "SPEAKING_COLLECTION",
    defaultCollection: "speakings",
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
        phrase: {
            type: String,
            required: true,
        },
        meaning: {
            type: String,
            required: true,
        },
        german_level: {
            type: String,
            required: true,
        },
        formality: {
            type: String,
            required: true,
        },
        region: {
            type: String,
            required: true,
        },
        usage_context: {
            type: String,
            required: true,
        },
    },
});
