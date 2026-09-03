import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Speaking service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const speakingConfig: ContentConfig = loadContentConfig({
    versionEnv: "SPEAKING_CONTENT_VERSION",
    collectionEnv: "SPEAKING_COLLECTION",
    defaultCollection: "speakings",
    defaultVersion: 1,
});
