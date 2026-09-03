import { createContentRouter } from "@langphy/shared/content";
import { readingControllers } from "../controllers/reading.controller.js";

/**
 * Reading routes. ⚠️ `/version` is registered before the
 * `/:categoryId/:unitId` param route so string ids never swallow it.
 */
export const readingRouter = createContentRouter({
    basePath: "/api/reading",
    controllers: readingControllers,
});