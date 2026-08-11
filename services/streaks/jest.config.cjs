/**
 * Jest config for services/streaks.
 *
 * Mirrors services/auth/jest.config.cjs. Tests run against a mocked
 * pgPool (see tests/helpers/mock-pg.ts) so no live database is needed.
 */
const path = require("path");
const STREAKS_DIR = __dirname;
const REPO_ROOT = path.resolve(STREAKS_DIR, "..", "..");
const SHARED_SRC = path.join(REPO_ROOT, "shared", "src");
const SHARED_DIST = path.join(REPO_ROOT, "shared", "dist");

module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["<rootDir>/tests/**/*.test.ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                tsconfig: "<rootDir>/tsconfig.test.json",
                useESM: false,
            },
        ],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
        ["^@shared/(.*)$"]: path.join(SHARED_SRC, "$1"),
        // The shared package's package.json declares "type": "module"
        // and main: dist/index.js (ESM). Jest runs as CJS in this
        // project, so the ESM file fails to parse. Instead, point at
        // the source TS — ts-jest will pick it up via the resolver.
        ["^@langphy/shared$"]: path.join(REPO_ROOT, "shared", "index.ts"),
        ["^@langphy/shared/(.*)$"]: path.join(SHARED_SRC, "$1.ts"),
    },
    clearMocks: true,
};