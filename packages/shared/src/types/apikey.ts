/**
 * Zugangsschlüssel für eingetragene Verbindungen.
 *
 * Gedacht für alles, was dauerhaft im eigenen Namen auf die API zugreift: der
 * MCP-Server, ein Skript, eine fremde Anwendung. Anders als ein
 * Auffrischungstoken lässt sich ein Schlüssel einzeln zurücknehmen, ohne alle
 * anderen Anmeldungen mitzureißen.
 */

/** `read` darf nur lesen. */
export type ApiKeyScope = "read" | "full"

export interface ApiKeyResponse {
    id: number
    name: string
    /** Die ersten Zeichen, damit man den Schlüssel in der Liste wiedererkennt. */
    preview: string
    scope: ApiKeyScope
    lastUsedAt: string | null
    expiresAt: string | null
    createdAt: string
}

export interface CreateApiKeyRequest {
    name: string
    scope?: ApiKeyScope
    /** Tage bis zum Ablauf. Fehlt es, läuft der Schlüssel nicht ab. */
    expiresInDays?: number
}

/**
 * Die einzige Antwort, in der der Schlüssel selbst steht. Danach gibt es ihn
 * nirgends mehr - die Datenbank kennt nur seinen Hash.
 */
export interface CreateApiKeyResponse {
    key: ApiKeyResponse
    token: string
}

export interface ApiKeyListResponse {
    keys: ApiKeyResponse[]
}
