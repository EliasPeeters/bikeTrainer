import type {Express} from "express"
import {randomUUID} from "node:crypto"
import request from "supertest"
import {sequelize, waitForDatabase} from "../../src/db/db"
import {createServer} from "../../src/index"

/**
 * Die Integrationstests fahren gegen eine echte MariaDB - dieselbe, die
 * `docker compose -f docker-compose-db-only.yml up -d` startet, mit dem von
 * Flyway erzeugten Schema.
 *
 * Absichtlich keine Attrappe der Datenbank: die interessanten Fehler dieser
 * Schicht sind genau die, die eine Attrappe wegdefiniert - ein eindeutiger
 * Index, ein Fremdschluessel, eine Spalte, die es im Schema gar nicht gibt.
 *
 * Die Tests raeumen die Tabellen bewusst nicht zwischendurch leer. Jeder Test
 * legt seinen eigenen Nutzer an und prueft nur dessen Daten - genau wie die API
 * es im Betrieb tut. Ein gemeinsames Leeren waere dagegen ein Rennen: laufen
 * zwei Testdateien parallel, loescht die eine der anderen die Daten weg.
 */
export async function setupTestServer(): Promise<Express> {
    await waitForDatabase(5, 1000)
    return createServer().app
}

export async function closeDatabase(): Promise<void> {
    await sequelize.close()
}

/**
 * Eindeutige Adresse je Aufruf.
 *
 * UUID statt Zeitstempel und Zaehler: jede Testdatei laeuft in einer eigenen
 * Modulregistrierung, also faengt der Zaehler dort wieder bei null an. Starten
 * zwei Dateien in derselben Millisekunde, erzeugen sie dieselbe Adresse - und
 * die zweite Registrierung scheitert mit 409, scheinbar zufaellig.
 */
export function uniqueEmail(prefix = "test"): string {
    return `${prefix}.${randomUUID()}@example.com`
}

export interface TestUser {
    token: string
    userID: number
    email: string
    name: string
}

/** Legt ein frisches Konto an und gibt das Zugangstoken zurück. */
export async function registerUser(app: Express, name = "Testfahrer"): Promise<TestUser> {
    const email = uniqueEmail()
    const response = await request(app)
        .post("/auth/register")
        .send({email, password: "geheim12", name})
        .expect(201)
    return {token: response.body.accessToken, userID: response.body.user.id, email, name}
}

export function auth(token: string): [string, string] {
    return ["Authorization", `Bearer ${token}`]
}

/** Ein einfaches, gültiges Programm: Einfahren, Block, Ausfahren. */
export function sampleSegments() {
    return [
        {
            title: "Einfahren",
            durationSeconds: 600,
            target: {type: "percentFTP", value: 0.45},
            targetEnd: {type: "percentFTP", value: 0.7},
        },
        {
            title: "Block",
            durationSeconds: 1200,
            target: {type: "percentFTP", value: 0.9},
            cadenceLow: 85,
            cadenceHigh: 95,
        },
        {title: "Ausfahren", durationSeconds: 300, target: {type: "percentFTP", value: 0.5}},
    ]
}
