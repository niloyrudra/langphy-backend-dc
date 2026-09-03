import { bootstrapContentService } from "@langphy/shared/content";
import { speakingRouter } from "./routes/speaking.route.js";

await bootstrapContentService({
    router: speakingRouter,
    mongoEnvVar: "SPEAKING_MONGO_URI",
    serviceName: "Speaking",
    mongoLabel: "Speaking",
    defaultPort: 4004,
});
