import { createContentRouter } from "@langphy/shared/content";
import { speakingControllers } from "../controllers/speaking.controller.js";

/**
 * Speaking routes. ⚠️ `/version` is registered before the
 * `/:categoryId/:unitId` param route so string ids never swallow it.
 */
export const speakingRouter = createContentRouter({
    basePath: "/api/speaking",
    controllers: speakingControllers,
});
