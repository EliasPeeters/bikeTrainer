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
    email?: string
    password?: string
    accessToken?: string
    refreshToken?: string
}

export function credentialsFromEnv(): Credentials {
    const value = (name: string): string | undefined => {
        const raw = process.env[name] ?? ""
        return raw.length > 0 ? raw : undefined
    }
    return {
        source: "env",
        email: value("WATTWERK_EMAIL"),
        password: value("WATTWERK_PASSWORD"),
        accessToken: value("WATTWERK_ACCESS_TOKEN"),
        refreshToken: value("WATTWERK_REFRESH_TOKEN"),
    }
}

/**
 * `Authorization: Bearer <token>` aus einem HTTP-Aufruf.
 *
 * Das Token wird als Auffrischungstoken gelesen: ein Zugangstoken gilt fuenfzehn
 * Minuten, was fuer eine eingetragene Verbindung unbrauchbar ist. Der Server
 * tauscht es bei jedem Aufruf gegen ein frisches Zugangstoken und behaelt nichts.
 */
export function credentialsFromAuthorizationHeader(header: string | undefined): Credentials | null {
    if (typeof header !== "string") {
        return null
    }
    const parts = header.split(" ")
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || parts[1].length === 0) {
        return null
    }
    return {source: "header", refreshToken: parts[1]}
}

export function hasCredentials(credentials: Credentials): boolean {
    return (
        (credentials.email !== undefined && credentials.password !== undefined) ||
        credentials.accessToken !== undefined ||
        credentials.refreshToken !== undefined
    )
}
