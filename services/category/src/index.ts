import { bootstrapContentService } from "@langphy/shared/content";
import { categoryRouter } from "./routes/category.route.js";

await bootstrapContentService({
    router: categoryRouter,
    mongoEnvVar: "CATEGORY_MONGO_URI",
    serviceName: "Category",
    mongoLabel: "Category",
    defaultPort: 4000,
});