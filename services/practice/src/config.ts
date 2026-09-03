import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Practice service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const practiceConfig: ContentConfig = loadContentConfig({
    versionEnv: "PRACTICE_CONTENT_VERSION",
    collectionEnv: "PRACTICE_COLLECTION",
    defaultCollection: "practices",
    defaultVersion: 1,
});
