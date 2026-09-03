import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Writing service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const writingConfig: ContentConfig = loadContentConfig({
    versionEnv: "WRITING_CONTENT_VERSION",
    collectionEnv: "WRITING_COLLECTION",
    defaultCollection: "writings",
    defaultVersion: 1,
});
