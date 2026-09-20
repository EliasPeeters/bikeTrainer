import type {AddressInfo} from "node:net"
import type {Server} from "node:http"
import {createHttpServer} from "../../src/http"

/**
 * Der HTTP-Einstieg gegen einen echten Serversockel, aber mit einem `fetch`-
 * Doppel an der Stelle der API. Was hier geprueft wird, ist die Torwache: ohne
 * Token nichts, nur POST, nur /mcp - und ein Token, das nicht gespeichert,
 * sondern durchgereicht wird.
 */

let server: Server
let base: string
let apiCalls: Array<{url: string; body: unknown}> = []

beforeAll(async () => {
    server = createHttpServer()
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address() as AddressInfo
    base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
})

const realFetch = global.fetch

beforeEach(() => {
    apiCalls = []
    global.fetch = (async (url: string, init: RequestInit = {}) => {
        const target = String(url)
        // Die Aufrufe an den eigenen Sockel muessen echt bleiben, sonst testet
        // sich der Test selbst.
        if (target.startsWith(base)) {
            return await realFetch(url as never, init as never)
        }
        apiCalls.push({url: target, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined})

        if (target.endsWith("/auth/refresh")) {
            const token = (init.body as string).includes("gutes-token")
            return json(token ? 200 : 401, token
                ? {accessToken: "access-1", refreshToken: "refresh-2"}
                : {error: "INVALID_TOKEN", message: "Token ungültig."})
        }
        // Ein Zugangsschluessel geht direkt an die API; nur der gute wird angenommen.
        const authorization = (init.headers as Record<string, string>)["authorization"] ?? ""
        if (authorization === "Bearer wk_zurueckgenommen") {
            return json(401, {error: "UNAUTHORIZED", message: "Anmeldung erforderlich."})
        }
        return json(200, {workouts: []})
    }) as typeof fetch
})

afterEach(() => {
    global.fetch = realFetch
})

function json(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        text: async () => JSON.stringify(body),
    } as Response
}

async function call(path: string, options: {method?: string; token?: string; body?: unknown} = {}) {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
    }
    if (options.token !== undefined) {
        headers.authorization = `Bearer ${options.token}`
    }
    const response = await realFetch(`${base}${path}`, {
        method: options.method ?? "POST",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const text = await response.text()
    return {status: response.status, headers: response.headers, body: text.length > 0 ? JSON.parse(text) : null}
}

describe("Torwache", () => {
    it("laesst /health ohne Token durch - eine Bereitschaftspruefung hat keine Zugangsdaten", async () => {
        const response = await call("/health", {method: "GET"})
        expect(response.status).toBe(200)
        expect(response.body.status).toBe("ok")
    })

    it("weist einen Aufruf ohne Token ab und sagt, was fehlt", async () => {
        const response = await call("/mcp", {body: {jsonrpc: "2.0", id: 1, method: "tools/list"}})
        expect(response.status).toBe(401)
        expect(response.headers.get("www-authenticate")).toBe('Bearer realm="wattwerk"')
        expect(response.body.error.message).toContain("Authorization: Bearer wk_")
        // Ohne Token darf nicht einmal die API angefasst werden.
        expect(apiCalls).toHaveLength(0)
    })

    it("weist einen kaputten Authorization-Header ab", async () => {
        const response = await realFetch(`${base}/mcp`, {
            method: "POST",
            headers: {"content-type": "application/json", authorization: "Basic abc"},
            body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}),
        })
        expect(response.status).toBe(401)
    })

    it("kennt nur POST auf /mcp", async () => {
        const get = await call("/mcp", {method: "GET", token: "gutes-token"})
        expect(get.status).toBe(405)
        expect(get.headers.get("allow")).toBe("POST, OPTIONS")

        const woanders = await call("/irgendwas", {token: "gutes-token"})
        expect(woanders.status).toBe(404)
    })

    it("gibt ohne eingetragene Herkunft keine CORS-Freigabe", async () => {
        const response = await realFetch(`${base}/mcp`, {
            method: "OPTIONS",
            headers: {origin: "https://fremde-seite.example"},
        })
        expect(response.status).toBe(204)
        expect(response.headers.get("access-control-allow-origin")).toBeNull()
    })
})

describe("Zugangsschlüssel", () => {
    it("geht unverändert an die API - nichts wird eingetauscht", async () => {
        await call("/mcp", {
            token: "wk_einguterschluessel",
            body: {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {name: "list_my_workouts", arguments: {}},
            },
        })

        // Kein /auth/refresh: ein Schlüssel läuft nicht ab.
        expect(apiCalls.map((entry) => entry.url).filter((url) => url.includes("/auth/"))).toEqual([])
        expect(apiCalls[0].url).toContain("/workouts")
    })

    it("sagt bei einem zurückgenommenen Schlüssel, was zu tun ist", async () => {
        const response = await call("/mcp", {
            token: "wk_zurueckgenommen",
            body: {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {name: "list_my_workouts", arguments: {}},
            },
        })

        const text = response.body.result.content[0].text
        expect(response.body.result.isError).toBe(true)
        expect(text).toContain("zurückgenommen")
        // Und kein zweiter Versuch: ein Schlüssel lässt sich nicht auffrischen.
        expect(apiCalls).toHaveLength(1)
    })
})

describe("Werkzeuge über HTTP", () => {
    it("beantwortet tools/list ohne vorheriges initialize - jeder Aufruf steht für sich", async () => {
        const response = await call("/mcp", {
            token: "gutes-token",
            body: {jsonrpc: "2.0", id: 1, method: "tools/list"},
        })
        expect(response.status).toBe(200)
        expect(response.body.result.tools).toHaveLength(20)
    })

    it("reicht das Token des Aufrufs an die API weiter, statt eines zu speichern", async () => {
        await call("/mcp", {
            token: "gutes-token",
            body: {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {name: "list_my_workouts", arguments: {}},
            },
        })

        expect(apiCalls[0].url).toContain("/auth/refresh")
        expect(apiCalls[0].body).toEqual({refreshToken: "gutes-token"})
        expect(apiCalls[1].url).toContain("/workouts")
    })

    it("macht aus einem abgelehnten Token einen Satz, den man lesen kann", async () => {
        const response = await call("/mcp", {
            token: "schlechtes-token",
            body: {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {name: "list_my_workouts", arguments: {}},
            },
        })
        expect(response.body.result.isError).toBe(true)
        expect(response.body.result.content[0].text).toContain("Auffrischungstoken")
    })
})
