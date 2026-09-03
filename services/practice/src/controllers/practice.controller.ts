import { createContentControllers } from "@langphy/shared/content";
import { Practice } from "../models/practice.model.js";
import { practiceConfig } from "../config.js";

/**
 * Practice controllers — built from the shared content kit. Standardized on
 * the hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const practiceControllers = createContentControllers({
    model: Practice,
    resource: "practice",
    config: practiceConfig,
    sort: { title: 1 },
    paramKeys: ["categoryId", "unitId"],
    messages: {
        notFound: "Practice lessons not found!",
        invalidParam: "Invalid Id!",
        serverError: "Failed to fetch practice lessons!",
    },
});
