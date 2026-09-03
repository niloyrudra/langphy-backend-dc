import { createContentRouter } from "@langphy/shared/content";
import { listeningControllers } from "../controllers/listening.controller.js";

/**
 * Listening routes. ⚠️ `/version` is registered before the
 * `/:categoryId/:unitId` param route so string ids never swallow it.
 */
export const listeningRouter = createContentRouter({
    basePath: "/api/listening",
    controllers: listeningControllers,
});