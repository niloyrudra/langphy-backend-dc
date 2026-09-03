import { bootstrapContentService } from "@langphy/shared/content";
import { practiceRouter } from "./routes/practice.route.js";

await bootstrapContentService({
    router: practiceRouter,
    mongoEnvVar: "PRACTICE_MONGO_URI",
    serviceName: "Practice",
    mongoLabel: "Practice",
    defaultPort: 4002,
});
