/**
 * Der eine Ort, an dem der MCP-Server seine Umgebung liest.
 *
 * Im stdio-Betrieb startet der Client (Claude Desktop, Claude Code, ...) den
 * Server als Unterprozess - es gibt keine Oberflaeche, auf der sich jemand
 * anmelden koennte, also kommen die Zugangsdaten aus der Umgebung. Im
 * HTTP-Betrieb ist das anders: dort bringt jeder Aufruf sein eigenes Token mit,
 * und der Server haelt gar keine Zugangsdaten. Deshalb sind Zugangsdaten hier
 * ein Wert und keine Konstante.
 */

export const API_URL = (process.env.WATTWERK_API_URL ?? "http://localhost:8088").replace(/\/+$/, "")

/**
 * Wie lange auf die API gewartet wird. Ein MCP-Aufruf, der ewig haengt, blockiert
 * den Client - lieber eine klare Fehlermeldung nach zwanzig Sekunden.
 */
export const REQUEST_TIMEOUT_MS = parseInt(process.env.WATTWERK_TIMEOUT_MS ?? "20000", 10)

/** Nur im HTTP-Betrieb. */
export const HTTP_PORT = parseInt(process.env.WATTWERK_MCP_PORT ?? "8090", 10)

/**
 * Welche Herkuenfte im Browser auf den MCP-Server zugreifen duerfen, als
 * kommagetrennte Liste. Leer heisst: keine. Ein MCP-Client ist normalerweise
 * kein Browser, und eine offene Freigabe waere hier nur ein Angebot an fremde
 * Seiten, mit dem Token des Nutzers zu arbeiten.
 */
export const HTTP_ALLOWED_ORIGINS = (process.env.WATTWERK_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

/**
 * Woher ein Token stammt. Steht nur in Fehlermeldungen - aber dort entscheidet
 * es, ob jemand in seiner Client-Konfiguration oder im Authorization-Header
 * nachsehen muss.
 */
export type CredentialSource = "env" | "header"

export interface Credentials {
    source: CredentialSource
    /** Bei OAuth: wer das Token bekommen hat, fuer das Log. */
    clientID?: string
    email?: string
    password?: string
    /**
     * Ein Zugangsschluessel aus dem Web-Portal (`wk_...`). Er laeuft nicht ab
     * und wird unveraendert an die API weitergereicht - es gibt nichts
     * einzutauschen.
     */
    apiKey?: string
    accessToken?: string
    refreshToken?: string
}

/** Zugangsschluessel tragen dieses Praefix, siehe ApiKeyToken.ts im Backend. */
export const API_KEY_PREFIX = "wk_"

export function credentialsFromEnv(): Credentials {
    const value = (name: string): string | undefined => {
        const raw = process.env[name] ?? ""
        return raw.length > 0 ? raw : undefined
    }
    return {
        source: "env",
        email: value("WATTWERK_EMAIL"),
        password: value("WATTWERK_PASSWORD"),
        apiKey: value("WATTWERK_API_KEY"),
        accessToken: value("WATTWERK_ACCESS_TOKEN"),
        refreshToken: value("WATTWERK_REFRESH_TOKEN"),
    }
}

/**
 * `Authorization: Bearer <token>` aus einem HTTP-Aufruf.
 *
 * Ein Zugangsschluessel (`wk_...`) geht unveraendert an die API weiter. Alles
 * andere wird als Auffrischungstoken gelesen und bei jedem Aufruf gegen ein
 * frisches Zugangstoken getauscht - ein Zugangstoken selbst gilt fuenfzehn
 * Minuten und taugt fuer eine eingetragene Verbindung nicht.
 */
export function credentialsFromAuthorizationHeader(header: string | undefined): Credentials | null {
    if (typeof header !== "string") {
        return null
    }
    const parts = header.split(" ")
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || parts[1].length === 0) {
        return null
    }
    const token = parts[1]
    return token.startsWith(API_KEY_PREFIX)
        ? {source: "header", apiKey: token}
        : {source: "header", refreshToken: token}
}

export function hasCredentials(credentials: Credentials): boolean {
    return (
        (credentials.email !== undefined && credentials.password !== undefined) ||
        credentials.apiKey !== undefined ||
        credentials.accessToken !== undefined ||
        credentials.refreshToken !== undefined
    )
}

// MARK: - OAuth

/**
 * Die kanonische Adresse dieses MCP-Servers (RFC 8707).
 *
 * Ein Zugangstoken ist an genau diesen Empfaenger gebunden. Steht hier etwas
 * anderes als das, was der Autorisierungsserver in `aud` schreibt, wird jedes
 * Token abgelehnt - lieber das, als Tokens anzunehmen, die fuer einen anderen
 * Dienst gedacht waren.
 */
export const MCP_PUBLIC_URL = (
    process.env.WATTWERK_MCP_PUBLIC_URL ?? "https://mcp.wattwerk.eliaspeeters.de/mcp"
).replace(/\/+$/, "")

/** Der Autorisierungsserver, auf den die Metadaten dieser Ressource verweisen. */
export const OAUTH_ISSUER = (process.env.WATTWERK_OAUTH_ISSUER ?? API_URL).replace(/\/+$/, "")

/**
 * Dasselbe Geheimnis wie in der API.
 *
 * Damit prueft dieser Dienst ein Zugangstoken selbst, ohne die API zu fragen.
 * Der Preis ist ein geteiltes Geheimnis zwischen zwei Diensten; der Gewinn ist,
 * dass ein ungueltiges Token sofort mit 401 beantwortet wird - und genau das
 * braucht ein MCP-Client, um von sich aus eine Anmeldung zu starten. Wuerde erst
 * der spaetere Werkzeugaufruf scheitern, bliebe die Verbindung scheinbar in
 * Ordnung und niemand faende den Weg zur Anmeldung.
 *
 * Ohne diesen Wert ist OAuth an diesem Dienst abgeschaltet; Zugangsschluessel
 * funktionieren weiter.
 */
export const OAUTH_ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? ""

export const OAUTH_ENABLED = OAUTH_ACCESS_TOKEN_SECRET.length > 0
