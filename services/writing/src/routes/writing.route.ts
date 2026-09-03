import { createContentRouter } from "@langphy/shared/content";
import { writingControllers } from "../controllers/writing.controller.js";

/**
 * Writing routes. ⚠️ `/version` is registered before the
 * `/:categoryId/:unitId` param route so string ids never swallow it.
 */
export const writingRouter = createContentRouter({
    basePath: "/api/writing",
    controllers: writingControllers,
});
