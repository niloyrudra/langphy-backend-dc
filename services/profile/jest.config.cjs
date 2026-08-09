/**
 * Jest config for services/profile.
 */
const path = require("path");
const PROFILE_DIR = __dirname;
const REPO_ROOT = path.resolve(PROFILE_DIR, "..", "..");
const SHARED_SRC = path.join(REPO_ROOT, "shared", "src");

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
    },
    clearMocks: true,
};
