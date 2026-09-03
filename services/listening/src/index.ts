import { bootstrapContentService } from "@langphy/shared/content";
import { listeningRouter } from "./routes/listening.route.js";

await bootstrapContentService({
    router: listeningRouter,
    mongoEnvVar: "LISTENING_MONGO_URI",
    serviceName: "Listening",
    mongoLabel: "Listening",
    defaultPort: 4007,
});