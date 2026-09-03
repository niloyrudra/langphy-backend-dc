import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Unit service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const unitConfig: ContentConfig = loadContentConfig({
    versionEnv: "UNIT_CONTENT_VERSION",
    collectionEnv: "UNIT_COLLECTION",
    defaultCollection: "units",
    defaultVersion: 1,
});