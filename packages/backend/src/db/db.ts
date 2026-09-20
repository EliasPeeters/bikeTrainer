import {Sequelize} from "sequelize"
import {DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER} from "../config/env"

console.log(`[DB] Verbinde mit mysql host=${DB_HOST} port=${DB_PORT} database=${DB_NAME} user=${DB_USER}`)

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "mysql",
    // Mit DB_LOG=1 schreibt Sequelize jede Abfrage ins Log - der schnellste Weg
    // zu sehen, was eine Bedingung wirklich erzeugt hat.
    logging: process.env.DB_LOG === "1" ? console.log : false,
    benchmark: true,
    // Das Schema kommt von Flyway, nicht von Sequelize: `sequelize.sync()` wird
    // nirgends aufgerufen. Sonst gaebe es zwei Stellen, die die Tabellen
    // definieren, und die erste Abweichung faellt in Produktion auf.
    define: {
        freezeTableName: true,
        timestamps: true,
    },
    pool: {
        max: 10,
        min: 1,
        acquire: 30000,
        idle: 5000,
    },
})

/**
 * Wartet beim Start auf die Datenbank.
 *
 * Im Compose-Stack startet die API, sobald Flyway durch ist - aber MariaDB
 * braucht nach dem ersten `docker compose up` noch einen Moment, bis sie
 * Verbindungen annimmt. Ohne diese Schleife stirbt der Container und wird
 * neugestartet, was im Log aussieht wie ein Fehler.
 */
export async function waitForDatabase(attempts = 30, delayMs = 2000): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await sequelize.authenticate()
            console.log("[DB] Verbindung steht")
            return
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.log(`[DB] Versuch ${attempt}/${attempts} fehlgeschlagen: ${message}`)
            if (attempt === attempts) {
                throw error
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
    }
}
