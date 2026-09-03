import { createContentRouter } from "@langphy/shared/content";
import { categoryControllers } from "../controllers/category.controller.js";

/**
 * Category routes. ⚠️ `/version` is registered before the `/:id` param route
 * so string ids never swallow it.
 */
export const categoryRouter = createContentRouter({
    basePath: "/api/category",
    controllers: categoryControllers,
    paramRoute: "/:id",
});