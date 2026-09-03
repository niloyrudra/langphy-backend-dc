import { createContentControllers } from "@langphy/shared/content";
import { Writing } from "../models/writing.model.js";
import { writingConfig } from "../config.js";

/**
 * Writing controllers — built from the shared content kit. Standardized on
 * the hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const writingControllers = createContentControllers({
    model: Writing,
    resource: "writing",
    config: writingConfig,
    paramKeys: ["categoryId", "unitId"],
    messages: {
        notFound: "Writing Lessons not found!",
        invalidParam: "Invalid Id!",
        serverError: "Failed to fetch Writing lessons!",
    },
});
