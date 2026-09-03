import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Quiz service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const quizConfig: ContentConfig = loadContentConfig({
    versionEnv: "QUIZ_CONTENT_VERSION",
    collectionEnv: "QUIZ_COLLECTION",
    defaultCollection: "quizzes",
    defaultVersion: 1,
});