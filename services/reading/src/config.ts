import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Reading service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const readingConfig: ContentConfig = loadContentConfig({
    versionEnv: "READING_CONTENT_VERSION",
    collectionEnv: "READING_COLLECTION",
    defaultCollection: "readings",
    defaultVersion: 1,
});