/**
 * Zwei Projekte, weil die beiden Arten von Tests verschiedene Voraussetzungen
 * haben: Unit-Tests laufen immer, Integrationstests brauchen die Datenbank aus
 * `docker compose -f docker-compose-db-only.yml up`.
 */
module.exports = {
    projects: [
        {
            displayName: "unit",
            preset: "ts-jest",
            testEnvironment: "node",
            testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
        },
        {
            displayName: "integration",
            preset: "ts-jest",
            testEnvironment: "node",
            testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
            setupFiles: ["<rootDir>/tests/integration/env.ts"],
            // Die Tests teilen sich eine Datenbank, also nacheinander.
            maxWorkers: 1,
        },
    ],
}
