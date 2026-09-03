import { createContentControllers } from "@langphy/shared/content";
import { Unit } from "../models/unit.model.js";
import { unitConfig } from "../config.js";

/**
 * Unit controllers — built from the shared content kit. Standardized on the
 * hardened category behavior: version route, `X-Content-Version` header,
 * JSON 404/500 responses.
 */
export const unitControllers = createContentControllers({
    model: Unit,
    resource: "unit",
    config: unitConfig,
    sort: { title: 1 },
    paramKeys: ["categoryId"],
    messages: {
        notFound: "Units not found!",
        invalidParam: "Invalid Category Id!",
        serverError: "Failed to fetch units!",
    },
});