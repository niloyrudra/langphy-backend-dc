import { bootstrapContentService } from "@langphy/shared/content";
import { writingRouter } from "./routes/writing.route.js";

await bootstrapContentService({
    router: writingRouter,
    mongoEnvVar: "WRITING_MONGO_URI",
    serviceName: "Writing",
    mongoLabel: "Writing",
    defaultPort: 4006,
});
