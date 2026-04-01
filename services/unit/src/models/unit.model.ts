import mongoose, { Model, Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * 1️⃣ Schema (single source of truth)
 */
const unitSchema = new Schema(
    {
        _id: {
            type: String,
            required: true
        },
        categoryId: {
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
        collection: "units",
        timestamps: false
    }
);

/**
 * 2️⃣ Infer TypeScript type directly from schema
 */
export type UnitDoc = InferSchemaType<typeof unitSchema>;

/**
 * 3️⃣ Typed model
 */
const Unit: Model<UnitDoc> = mongoose.model<UnitDoc>(
    "Unit",
    unitSchema
);

export { Unit };