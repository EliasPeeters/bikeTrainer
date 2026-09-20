import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {createServer, IncomingMessage, ServerResponse} from "node:http"
import {WattwerkClient} from "./api"
import {API_URL, credentialsFromAuthorizationHeader, HTTP_ALLOWED_ORIGINS} from "./config"
import {createMcpServer} from "./index"

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
        sendJSON(response, 200, {status: "ok", api: API_URL})
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

    const credentials = credentialsFromAuthorizationHeader(request.headers.authorization)
    if (credentials === null) {
        // Der Header nach RFC 6750 - daran erkennt ein Client, dass ihm ein
        // Token fehlt, statt einen kaputten Server zu vermuten.
        response.setHeader("WWW-Authenticate", 'Bearer realm="wattwerk"')
        sendJSON(
            response,
            401,
            rpcError(
                -32001,
                "Kein Token. Schicke \"Authorization: Bearer wk_...\" mit - einen " +
                    "Zugangsschlüssel aus dem Wattwerk-Portal unter Profil → Zugangsschlüssel."
            )
        )
        return
    }

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
