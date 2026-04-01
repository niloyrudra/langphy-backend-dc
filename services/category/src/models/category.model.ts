import mongoose, { Schema, Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * 1️⃣ Schema (single source of truth)
 */
const categorySchema = new Schema(
    {
        _id: {
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
        position_at: {
            type: Number,
            required: true,
        },
    },
    {
        collection: "categories",
        timestamps: false,
    }
);

/**
 * 2️⃣ Infer TypeScript type directly from schema
 */
export type CategoryDoc = InferSchemaType<typeof categorySchema>;

/**
 * 3️⃣ Typed model
 */
const Category: Model<CategoryDoc> = mongoose.model<CategoryDoc>(
  "Category",
  categorySchema
);

export { Category };