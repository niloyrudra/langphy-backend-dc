import { createContentRouter } from "@langphy/shared/content";
import { practiceControllers } from "../controllers/practice.controller.js";

/**
 * Practice routes. ⚠️ `/version` is registered before the
 * `/:categoryId/:unitId` param route so string ids never swallow it.
 */
export const practiceRouter = createContentRouter({
    basePath: "/api/practices",
    controllers: practiceControllers,
});
