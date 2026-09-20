/**
 * Nur Unit-Tests: der MCP-Server hat keine eigene Datenbank, und was er mit der
 * API austauscht, wird hier gegen ein `fetch`-Doppel geprueft. Den Weg gegen
 * eine echte API decken die Integrationstests des Backends ab.
 */
module.exports = {
    displayName: "unit",
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
    setupFiles: ["<rootDir>/tests/unit/env.ts"],
}
