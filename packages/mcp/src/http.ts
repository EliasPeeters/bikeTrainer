import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {createServer, IncomingMessage, ServerResponse} from "node:http"
import {WattwerkClient} from "./api"
import {
    API_URL,
    Credentials,
    credentialsFromAuthorizationHeader,
    HTTP_ALLOWED_ORIGINS,
    OAUTH_ENABLED,
} from "./config"
import {createMcpServer} from "./index"
import {challengeHeader, checkAccessToken, protectedResourceMetadata, PROTECTED_RESOURCE_PATH} from "./oauth"

/**
 * Derselbe MCP-Server, nur ueber HTTP statt stdio.
 *
 * Der Unterschied ist nicht der Transport, sondern die Anmeldung: bei stdio
 * gehoert der Prozess einem Menschen, und seine Zugangsdaten stehen in der
 * Umgebung. Hier kann jeder anklopfen. Deshalb bringt jeder Aufruf sein eigenes
 * Token mit, der Server speichert keines, und ohne Token gibt es nichts - auch
 * nicht die oeffentlichen Werkzeuge. Wer den Katalog ohne Konto lesen will,
 * fragt die API direkt; dafuer braucht es keinen MCP-Server.
 *
 * Als Token taugt ein Zugangsschluessel (`wk_...`) oder ein Auffrischungstoken.
 * Der Schluessel ist der bessere Weg: er laesst sich einzeln zuruecknehmen,
 * kann auf Lesen beschraenkt werden und laeuft nicht nach 90 Tagen ab.
 */

export const MCP_PATH = "/mcp"
/** Ein MCP-Koerper ist eine Handvoll JSON. Alles darueber ist kein Aufruf, sondern ein Versuch. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

export function createHttpServer() {
    return createServer((request, response) => {
        void handle(request, response).catch((error) => {
            console.error("[wattwerk-mcp] Unbehandelter Fehler", error)
            if (!response.headersSent) {
                sendJSON(response, 500, rpcError(-32603, "Interner Fehler."))
            }
        })
    })
}

async function handle(request: IncomingMessage, response: ServerResponse) {
    applyCORS(request, response)

    if (request.method === "OPTIONS") {
        response.writeHead(204).end()
        return
    }

    const path = (request.url ?? "/").split("?")[0]

    // Damit Docker und der Proxy sehen, dass der Dienst lebt - ohne Token, weil
    // eine Bereitschaftspruefung keine Zugangsdaten haben kann.
    if (path === "/health") {
        sendJSON(response, 200, {status: "ok", api: API_URL, oauth: OAUTH_ENABLED})
        return
    }

    // Das Metadatendokument dieser Ressource (RFC 9728). Ohne Token, denn es
    // ist genau das, was ein Client liest, *weil* er noch keines hat. Manche
    // Clients haengen den Pfad der Ressource an, deshalb auch alles darunter.
    if (path === PROTECTED_RESOURCE_PATH || path.startsWith(`${PROTECTED_RESOURCE_PATH}/`)) {
        sendJSON(response, 200, protectedResourceMetadata())
        return
    }

    if (path !== MCP_PATH) {
        sendJSON(response, 404, rpcError(-32601, `Es gibt nur ${MCP_PATH}.`))
        return
    }

    // GET und DELETE gehoeren zum sitzungsbehafteten Betrieb, den es hier nicht
    // gibt: jeder Aufruf steht fuer sich, weil sein Token fuer sich steht.
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS")
        sendJSON(response, 405, rpcError(-32601, "Nur POST."))
        return
    }

    const resolved = resolveCredentials(request.headers.authorization)
    if ("challenge" in resolved) {
        // Der Header nach RFC 6750 und RFC 9728: daran erkennt ein Client, dass
        // ihm ein Token fehlt *und wo er eins bekommt*. Ohne den Verweis auf das
        // Metadatendokument faende er den Autorisierungsserver nicht und meldete
        // nur, dass etwas nicht ging.
        response.setHeader("WWW-Authenticate", resolved.challenge)
        sendJSON(response, 401, rpcError(-32001, resolved.message))
        return
    }
    const credentials = resolved.credentials

    let body: unknown
    try {
        body = await readBody(request)
    } catch (error) {
        sendJSON(response, 413, rpcError(-32600, error instanceof Error ? error.message : "Körper unlesbar."))
        return
    }

    // Ein frischer Server je Aufruf: er traegt das Token dieses Aufrufs und
    // nichts sonst. Eine Sitzungsverwaltung waere hier ein Behaelter, in dem
    // fremde Tokens nebeneinander liegen - und der bei jedem Neustart des
    // Containers ohnehin leer waere.
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    })
    const server = createMcpServer(new WattwerkClient(credentials))

    response.on("close", () => {
        void transport.close()
        void server.close()
    })

    await server.connect(transport)
    await transport.handleRequest(request, response, body)
}

/**
 * Nur eingetragene Herkuenfte. Ein MCP-Client ist normalerweise kein Browser
 * und schickt gar keinen Origin - eine offene Freigabe waere deshalb kein
 * Entgegenkommen, sondern ein Angebot an fremde Seiten, mit dem Token des
 * Nutzers zu arbeiten.
 */
function applyCORS(request: IncomingMessage, response: ServerResponse) {
    const origin = request.headers.origin
    if (typeof origin !== "string" || !HTTP_ALLOWED_ORIGINS.includes(origin)) {
        return
    }
    response.setHeader("Access-Control-Allow-Origin", origin)
    response.setHeader("Vary", "Origin")
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id, mcp-protocol-version")
    response.setHeader("Access-Control-Max-Age", "86400")
}

/**
 * Woraus die Identitaet dieses Aufrufs kommt.
 *
 * Drei Wege, in dieser Reihenfolge: ein Zugangsschluessel aus dem Portal, ein
 * OAuth-Zugangstoken, und - fuer alte Konfigurationen - ein Auffrischungstoken.
 * Ein OAuth-Token, das nicht stimmt, ist dabei etwas anderes als keines: es
 * wird abgelehnt, statt als Auffrischungstoken durchgereicht zu werden.
 */
function resolveCredentials(
    header: string | undefined
): {credentials: Credentials} | {challenge: string; message: string} {
    const fallback = credentialsFromAuthorizationHeader(header)
    if (fallback === null) {
        return {
            challenge: challengeHeader(),
            message: OAUTH_ENABLED
                ? "Kein Token. Melde dich über den Autorisierungsserver an, oder schicke einen " +
                  "Zugangsschlüssel als \"Authorization: Bearer wk_...\" mit."
                : "Kein Token. Schicke \"Authorization: Bearer wk_...\" mit - einen " +
                  "Zugangsschlüssel aus dem Wattwerk-Portal unter Profil → Zugangsschlüssel.",
        }
    }

    // Ein Zugangsschluessel wird hier nicht geprueft: das kann nur die API, die
    // ihn kennt. Er faellt beim ersten Werkzeugaufruf auf, mit klarer Meldung.
    if (fallback.apiKey !== undefined) {
        return {credentials: fallback}
    }

    const checked = checkAccessToken(fallback.refreshToken ?? "")
    if (checked === null) {
        return {credentials: fallback}
    }
    if (!checked.ok) {
        return {
            challenge: challengeHeader(checked.error, checked.description),
            message: checked.description,
        }
    }
    return {credentials: checked.credentials}
}

async function readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        size += (chunk as Buffer).length
        if (size > MAX_BODY_BYTES) {
            throw new Error("Der Anfragekörper ist zu groß.")
        }
        chunks.push(chunk as Buffer)
    }
    const raw = Buffer.concat(chunks).toString("utf8")
    return raw.length === 0 ? undefined : JSON.parse(raw)
}

function rpcError(code: number, message: string) {
    return {jsonrpc: "2.0", error: {code, message}, id: null}
}

function sendJSON(response: ServerResponse, status: number, body: unknown) {
    const payload = JSON.stringify(body)
    response.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
    })
    response.end(payload)
}
