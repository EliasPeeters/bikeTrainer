/**
 * Der eine Ort, an dem Umgebungsvariablen gelesen werden.
 *
 * Alles hat einen Standardwert, damit `yarn backend:start` gegen die lokale
 * Datenbank ohne .env laeuft. Die Standardwerte der Token-Geheimnisse sind
 * bewusst als solche erkennbar - `assertProductionConfig` verweigert damit den
 * Start in Produktion.
 */

export const NODE_ENV = process.env.NODE_ENV ?? "development"
export const IS_PRODUCTION = NODE_ENV === "production"

export const PORT = parseInt(process.env.PORT ?? "8080", 10)

export const DB_HOST = process.env.DB_HOST ?? "localhost"
export const DB_PORT = parseInt(process.env.DB_PORT ?? "3307", 10)
export const DB_NAME = process.env.DB_NAME ?? "wattwerk"
export const DB_USER = process.env.DB_USER ?? "wattwerk"
export const DB_PASSWORD = process.env.DB_PASSWORD ?? "password"

const DEFAULT_ACCESS_SECRET = "dev-access-secret-nicht-fuer-produktion"
const DEFAULT_REFRESH_SECRET = "dev-refresh-secret-nicht-fuer-produktion"

export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? DEFAULT_ACCESS_SECRET
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? DEFAULT_REFRESH_SECRET

/** Kurz genug, dass ein abgegriffenes Token schnell wertlos ist. */
export const ACCESS_TOKEN_LIFETIME = process.env.ACCESS_TOKEN_LIFETIME ?? "15m"
/** Lang genug, dass die App sich nicht staendig neu anmelden laesst. */
export const REFRESH_TOKEN_LIFETIME = process.env.REFRESH_TOKEN_LIFETIME ?? "90d"

/**
 * Grenzen der Anmelderouten, ueber die Umgebung einstellbar.
 *
 * Nicht fest verdrahtet, weil der richtige Wert vom Betrieb abhaengt: hinter
 * einem NAT teilen sich viele Nutzer eine IP, und was dort eine Bremse ist,
 * ist anderswo eine Sperre. Die Tests setzen sie hoch, damit nicht die
 * Begrenzung getestet wird, wo es um die Registrierung geht.
 */
export const REGISTER_RATE_LIMIT = parseInt(process.env.REGISTER_RATE_LIMIT ?? "5", 10)
export const REGISTER_RATE_WINDOW_MS = parseInt(process.env.REGISTER_RATE_WINDOW_MS ?? "3600000", 10)
export const LOGIN_RATE_LIMIT = parseInt(process.env.LOGIN_RATE_LIMIT ?? "5", 10)
export const LOGIN_RATE_WINDOW_MS = parseInt(process.env.LOGIN_RATE_WINDOW_MS ?? "60000", 10)

/**
 * Welche Web-Herkünfte im Browser auf die API zugreifen dürfen, als
 * kommagetrennte Liste.
 *
 * Leer bedeutet außerhalb der Produktion "jede" - lokal ist das bequem und
 * harmlos. In Produktion bedeutet leer "keine": eine API, die jeder fremden
 * Seite im Browser des angemeldeten Nutzers antwortet, verschenkt den Schutz,
 * den die gleiche Herkunft sonst gibt. Die nativen Apps schicken keinen
 * Origin-Header und sind davon nicht betroffen.
 */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

/** Fuer die Links in Bestaetigungsmails. */
export const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

/**
 * Bricht den Start ab, wenn in Produktion noch die Entwicklungs-Geheimnisse
 * stehen. Ein Zugangstoken, dessen Schluessel im Repository steht, ist kein
 * Zugangstoken - und es faellt sonst erst auf, wenn jemand es ausnutzt.
 */
export function assertProductionConfig() {
    if (!IS_PRODUCTION) {
        return
    }

    const problems: string[] = []
    if (ACCESS_TOKEN_SECRET === DEFAULT_ACCESS_SECRET) {
        problems.push("ACCESS_TOKEN_SECRET")
    }
    if (REFRESH_TOKEN_SECRET === DEFAULT_REFRESH_SECRET) {
        problems.push("REFRESH_TOKEN_SECRET")
    }
    if (DB_PASSWORD === "password") {
        problems.push("DB_PASSWORD")
    }

    if (problems.length > 0) {
        throw new Error(
            `Produktionsstart abgebrochen: ${problems.join(", ")} steht noch auf dem Entwicklungswert.`
        )
    }
}
