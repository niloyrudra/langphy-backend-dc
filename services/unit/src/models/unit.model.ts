import { createContentModel } from "@langphy/shared/content";

/**
 * Unit schema — the service-specific part. The schema fields stay here;
 * the active-collection pointer + `InferSchemaType`/`model<>` boilerplate now
 * live in the shared `createContentModel` factory.
 */
export const Unit = createContentModel({
    modelName: "Unit",
    collectionEnv: "UNIT_COLLECTION",
    defaultCollection: "units",
    timestamps: false,
    fields: {
        // _id: default Mongoose ObjectId (live data stores ObjectId; keep default)
        categoryId: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        slug: {
            type: String,
            required: true,
        },
    },
});