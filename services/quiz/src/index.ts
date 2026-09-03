import { bootstrapContentService } from "@langphy/shared/content";
import { quizRouter } from "./routes/quiz.route.js";

await bootstrapContentService({
    router: quizRouter,
    mongoEnvVar: "QUIZ_MONGO_URI",
    serviceName: "Quiz",
    mongoLabel: "Quiz",
    defaultPort: 4003,
});