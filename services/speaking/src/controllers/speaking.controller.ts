import { createContentControllers } from "@langphy/shared/content";
import { Speaking } from "../models/speaking.model.js";
import { speakingConfig } from "../config.js";

/**
 * Speaking controllers — built from the shared content kit. Standardized on
 * the hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const speakingControllers = createContentControllers({
    model: Speaking,
    resource: "speaking",
    config: speakingConfig,
    paramKeys: ["categoryId", "unitId"],
    messages: {
        notFound: "Speaking Lessons not found!",
        invalidParam: "Invalid Id!",
        serverError: "Failed to fetch Speaking lessons!",
    },
});
