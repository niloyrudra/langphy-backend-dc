import { createContentRouter } from "@langphy/shared/content";
import { quizControllers } from "../controllers/quiz.controller.js";

/**
 * Quiz routes. ⚠️ `/version` is registered before the `/:categoryId/:unitId`
 * param route so string ids never swallow it.
 */
export const quizRouter = createContentRouter({
    basePath: "/api/quizzes",
    controllers: quizControllers,
});