import { createContentControllers } from "@langphy/shared/content";
import { Reading } from "../models/reading.model.js";
import { readingConfig } from "../config.js";

/**
 * Reading controllers — built from the shared content kit. Standardized on
 * the hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const readingControllers = createContentControllers({
    model: Reading,
    resource: "reading",
    config: readingConfig,
    paramKeys: ["categoryId", "unitId"],
    messages: {
        notFound: "Reading Lessons not found!",
        invalidParam: "Invalid Id!",
        serverError: "Failed to fetch Reading lessons!",
    },
});