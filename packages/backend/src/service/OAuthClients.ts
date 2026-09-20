import {DBOAuthClient} from "../db/DBOAuth"

/**
 * Woher ein Client kommt, den wir noch nie gesehen haben.
 *
 * Zwei Wege, und der erste ist der vorgesehene: eine HTTPS-URL als `client_id`,
 * hinter der ein Metadatendokument liegt (Client ID Metadata Documents). Der
 * Client hostet es selbst, wir holen es bei Bedarf - dadurch gibt es hier keine
 * Kopie, die veralten kann, und keine Registrierung, die jemand missbrauchen
 * koennte, um die Tabelle vollzuschreiben.
 *
 * Der zweite ist Dynamic Client Registration. Offiziell veraltet, aber noch das,
 * was viele Clients tun - deshalb bleibt er.
 */

export interface OAuthClient {
    clientID: string
    clientName: string
    redirectUris: string[]
    /** `true`, wenn die Angaben aus einem selbst gehosteten Dokument stammen. */
    fromMetadataDocument: boolean
}

const METADATA_TIMEOUT_MS = 5000
const METADATA_MAX_BYTES = 64 * 1024
const METADATA_CACHE_MS = 10 * 60 * 1000

const cache = new Map<string, {client: OAuthClient; until: number}>()

export async function resolveClient(clientID: string): Promise<OAuthClient | null> {
    if (isMetadataDocumentURL(clientID)) {
        return await clientFromMetadataDocument(clientID)
    }

    const registered = await DBOAuthClient.findOne({where: {clientID}})
    if (registered === null) {
        return null
    }
    return {
        clientID: registered.clientID,
        clientName: registered.clientName,
        redirectUris: registered.redirectUris,
        fromMetadataDocument: false,
    }
}

/**
 * Eine Kennung ist ein Dokumentverweis, wenn sie eine HTTPS-URL mit Pfad ist.
 *
 * Der Pfad ist Pflicht: `https://example.com` allein wuerde bedeuten, dass wer
 * auch immer die Domain kontrolliert, jede Kennung darunter beanspruchen kann.
 */
export function isMetadataDocumentURL(clientID: string): boolean {
    let url: URL
    try {
        url = new URL(clientID)
    } catch {
        return false
    }
    return url.protocol === "https:" && url.pathname.length > 1
}

async function clientFromMetadataDocument(clientID: string): Promise<OAuthClient | null> {
    const cached = cache.get(clientID)
    if (cached !== undefined && cached.until > Date.now()) {
        return cached.client
    }

    if (!isPublicHost(new URL(clientID).hostname)) {
        // Sonst waere das hier ein Werkzeug, mit dem sich von aussen Dienste im
        // internen Netz abfragen lassen.
        console.warn(`[OAUTH] Metadatendokument auf nicht-oeffentlichem Host abgelehnt: ${clientID}`)
        return null
    }

    let body: string
    try {
        const response = await fetch(clientID, {
            headers: {accept: "application/json"},
            signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
            redirect: "error",
        })
        if (!response.ok) {
            return null
        }
        body = (await response.text()).slice(0, METADATA_MAX_BYTES)
    } catch (error) {
        console.warn(`[OAUTH] Metadatendokument nicht erreichbar: ${clientID}`, error)
        return null
    }

    let document: Record<string, unknown>
    try {
        document = JSON.parse(body) as Record<string, unknown>
    } catch {
        return null
    }

    // Die Kennung im Dokument muss der URL entsprechen, unter der es liegt -
    // sonst koennte jeder ein Dokument hinlegen, das sich fuer einen anderen
    // ausgibt.
    if (document.client_id !== clientID) {
        console.warn(`[OAUTH] client_id im Dokument passt nicht zur URL: ${clientID}`)
        return null
    }

    const redirectUris = Array.isArray(document.redirect_uris)
        ? document.redirect_uris.filter((uri): uri is string => typeof uri === "string")
        : []
    if (redirectUris.length === 0) {
        return null
    }

    const client: OAuthClient = {
        clientID,
        clientName:
            typeof document.client_name === "string" && document.client_name.trim().length > 0
                ? document.client_name.trim().slice(0, 200)
                : new URL(clientID).hostname,
        redirectUris,
        fromMetadataDocument: true,
    }

    cache.set(clientID, {client, until: Date.now() + METADATA_CACHE_MS})
    return client
}

/**
 * Grobe Sperre gegen Abfragen ins eigene Netz.
 *
 * Nur gegen die Schreibweise, nicht gegen einen Namen, der auf eine interne
 * Adresse zeigt - dafuer muesste vor dem Abruf aufgeloest und die Verbindung
 * an die geprüfte Adresse gebunden werden. Fuer den Anfang haelt das die
 * offensichtlichen Faelle auf; wer es dichter braucht, setzt einen Proxy mit
 * Erlaubnisliste davor.
 */
function isPublicHost(hostname: string): boolean {
    const lower = hostname.toLowerCase()
    if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal")) {
        return false
    }
    if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower)) {
        return false
    }
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(lower)) {
        return false
    }
    if (/^169\.254\./.test(lower) || lower === "0.0.0.0" || lower === "::1" || lower === "[::1]") {
        return false
    }
    return true
}

/** Nur fuer Tests: der Zwischenspeicher haelt sonst ueber Testgrenzen hinweg. */
export function clearClientCache(): void {
    cache.clear()
}
