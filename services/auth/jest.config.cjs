/**
 * Jest config for services/auth.
 */
const path = require("path");
const AUTH_DIR = __dirname;
const REPO_ROOT = path.resolve(AUTH_DIR, "..", "..");
const SHARED_SRC = path.join(REPO_ROOT, "shared", "src");

module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    setupFiles: ["<rootDir>/tests/setup.ts"],
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
    // Neon connection warm-up + bcrypt cost 12 hashing on every signup/signin
    // make integration tests slower than the 5s Jest default.
    testTimeout: 120000,
};