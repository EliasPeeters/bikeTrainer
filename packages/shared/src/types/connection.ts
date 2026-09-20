/**
 * Eine Anwendung, der jemand über OAuth Zugriff erlaubt hat.
 *
 * Im Portal steht sie neben den Zugangsschlüsseln: beides sind Zugänge, die in
 * fremdem Auftrag arbeiten, und beide lassen sich einzeln zurücknehmen.
 */
export interface ConnectionResponse {
    id: number
    /** Wie die Anwendung sich genannt hat, etwa "ChatGPT". */
    clientName: string
    clientID: string
    /** Leerzeichengetrennt, etwa "wattwerk:read wattwerk:write". */
    scope: string
    lastUsedAt: string | null
    expiresAt: string | null
    createdAt: string
}

export interface ConnectionListResponse {
    connections: ConnectionResponse[]
}
