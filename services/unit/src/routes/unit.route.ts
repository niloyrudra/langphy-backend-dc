import { createContentRouter } from "@langphy/shared/content";
import { unitControllers } from "../controllers/unit.controller.js";

/**
 * Unit routes. ⚠️ `/version` is registered before the `/:categoryId` param
 * route so string ids never swallow it.
 */
export const unitRouter = createContentRouter({
    basePath: "/api/unit",
    controllers: unitControllers,
    paramRoute: "/:categoryId",
});