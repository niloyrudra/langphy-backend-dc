import { createContentControllers } from "@langphy/shared/content";
import { Category } from "../models/category.model.js";
import { categoryConfig } from "../config.js";

/**
 * Category controllers — built from the shared content kit. Preserves the
 * hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const categoryControllers = createContentControllers({
    model: Category,
    resource: "category",
    config: categoryConfig,
    sort: { position_at: 1 },
    paramKeys: ["id"],
    single: true, // GET /api/category/:id returns a single doc (findOne)
    messages: {
        notFound: "Categories not found!",
        invalidParam: "Invalid Category ID!",
        serverError: "Failed to fetch categoires!",
    },
});