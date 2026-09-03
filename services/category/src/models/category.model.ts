import { createContentModel } from "@langphy/shared/content";

/**
 * Category schema — the service-specific part. The schema fields stay here;
 * the active-collection pointer + `InferSchemaType`/`model<>` boilerplate now
 * live in the shared `createContentModel` factory.
 */
export const Category = createContentModel({
    modelName: "Category",
    collectionEnv: "CATEGORY_COLLECTION",
    defaultCollection: "categories",
    timestamps: false,
    fields: {
        // _id: default Mongoose ObjectId (live data stores ObjectId; keep default)
        title: {
            type: String,
            required: true,
        },
        slug: {
            type: String,
            required: true,
        },
        position_at: {
            type: Number,
            required: true,
        },
    },
});