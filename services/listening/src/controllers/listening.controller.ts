import { createContentControllers } from "@langphy/shared/content";
import { Listening } from "../models/listening.model.js";
import { listeningConfig } from "../config.js";

/**
 * Listening controllers — built from the shared content kit. Standardized on
 * the hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses. CORS stays disabled (matches category/unit/quiz).
 */
export const listeningControllers = createContentControllers({
    model: Listening,
    resource: "listening",
    config: listeningConfig,
    paramKeys: ["categoryId", "unitId"],
    messages: {
        notFound: "Listening Lessons not found!",
        invalidParam: "Invalid Id!",
        serverError: "Failed to fetch Listening lessons!",
    },
});