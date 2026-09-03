import { createContentControllers } from "@langphy/shared/content";
import { Quiz } from "../models/quiz.model.js";
import { quizConfig } from "../config.js";

/**
 * Quiz controllers — built from the shared content kit. Standardized on the
 * hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const quizControllers = createContentControllers({
    model: Quiz,
    resource: "quiz",
    config: quizConfig,
    paramKeys: ["categoryId", "unitId"],
    messages: {
        notFound: "Quizzes not found!",
        invalidParam: "Invalid Id!",
        serverError: "Failed to fetch Quiz lessons!",
    },
});