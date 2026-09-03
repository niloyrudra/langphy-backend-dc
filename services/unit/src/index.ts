import { bootstrapContentService } from "@langphy/shared/content";
import { unitRouter } from "./routes/unit.route.js";

await bootstrapContentService({
    router: unitRouter,
    mongoEnvVar: "UNIT_MONGO_URI",
    serviceName: "Unit",
    mongoLabel: "Unit",
    defaultPort: 4001,
});