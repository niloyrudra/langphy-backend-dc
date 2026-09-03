import { loadContentConfig, type ContentConfig } from "@langphy/shared/content";

/**
 * Category service runtime config.
 * Read from env at boot; used by the model (active collection) and the
 * version endpoint (current content version).
 */
export const categoryConfig: ContentConfig = loadContentConfig({
    versionEnv: "CATEGORY_CONTENT_VERSION",
    collectionEnv: "CATEGORY_COLLECTION",
    defaultCollection: "categories",
    defaultVersion: 1,
});