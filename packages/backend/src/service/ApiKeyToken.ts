import {createHash, randomBytes, timingSafeEqual} from "node:crypto"

/**
 * Das Format der Zugangsschlüssel - ohne Datenbank.
 *
 * Eigene Datei, weil der TokenService beim ersten Blick auf einen Header nur
 * wissen muss, *ob* es ein Schlüssel ist. Läge das im Sequelize-Modell, zöge
 * jeder Import eine Datenbankverbindung mit - auch in den Unit-Tests, die
 * keine haben.
 */

/** Damit ein Schlüssel im Log oder in einer Zwischenablage als solcher erkennbar ist. */
export const API_KEY_PREFIX = "wk_"

/**
 * 256 Bit Zufall, base64url kodiert.
 *
 * Nicht zu erraten und nicht zu erschoepfen. Deshalb reicht beim Nachschlagen
 * ein SHA-256 statt einer absichtlich langsamen Funktion - das Argument fuer
 * bcrypt gilt bei Passwoertern, die ein Mensch sich ausdenkt, nicht hier. Und
 * langsam waere hier teuer: der Hash wird bei *jedem* Aufruf gebildet.
 */
export function generateApiKey(): string {
    return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`
}

export function hashApiKey(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex")
}

export function isApiKey(token: string): boolean {
    return token.startsWith(API_KEY_PREFIX)
}

/** Die ersten Zeichen nach dem Praefix - genug zum Wiedererkennen, zu wenig zum Raten. */
export function apiKeyPreview(token: string): string {
    return token.slice(0, API_KEY_PREFIX.length + 6)
}

/**
 * Vergleicht zwei Hashes in konstanter Zeit.
 *
 * Streng genommen unnoetig, weil ueber einen eindeutigen Index gesucht wird und
 * die Datenbank den Vergleich macht. Es steht trotzdem hier, damit ein
 * spaeterer Umbau auf "alle Schluessel des Nutzers durchgehen" nicht
 * stillschweigend eine Zeitmessung aufmacht.
 */
export function hashesMatch(left: string, right: string): boolean {
    const a = Buffer.from(left, "utf8")
    const b = Buffer.from(right, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
}
