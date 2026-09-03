import { bootstrapContentService } from "@langphy/shared/content";
import { readingRouter } from "./routes/reading.route.js";

await bootstrapContentService({
    router: readingRouter,
    mongoEnvVar: "READING_MONGO_URI",
    serviceName: "Reading",
    mongoLabel: "Reading",
    defaultPort: 4005,
});