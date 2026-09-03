import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Listening service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const listeningConfig: ContentConfig = loadContentConfig({
    versionEnv: "LISTENING_CONTENT_VERSION",
    collectionEnv: "LISTENING_COLLECTION",
    defaultCollection: "listenings",
    defaultVersion: 1,
});