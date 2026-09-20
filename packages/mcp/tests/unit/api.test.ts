import {WattwerkApiError, WattwerkClient} from "../../src/api"

interface Call {
    url: string
    method: string
    authorization: string | undefined
    body: unknown
}

let calls: Call[] = []
let responses: Array<{status: number; body: unknown}> = []

function respond(status: number, body: unknown) {
    responses.push({status, body})
}

function loginResponse(accessToken: string) {
    return {
        user: {id: 1},
        accessToken,
        refreshToken: "refresh-1",
    }
}

beforeEach(() => {
    calls = []
    responses = []

    global.fetch = (async (url: string, init: RequestInit = {}) => {
        const headers = (init.headers ?? {}) as Record<string, string>
        calls.push({
            url: String(url),
            method: init.method ?? "GET",
            authorization: headers["authorization"],
            body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
        })

        const next = responses.shift()
        if (next === undefined) {
            throw new Error(`Keine Antwort hinterlegt fuer ${init.method ?? "GET"} ${String(url)}`)
        }
        return {
            ok: next.status >= 200 && next.status < 300,
            status: next.status,
            statusText: String(next.status),
            text: async () => JSON.stringify(next.body),
        } as Response
    }) as typeof fetch
})

describe("Anmeldung", () => {
    it("meldet sich beim ersten Aufruf an, der ein Token braucht", async () => {
        respond(200, loginResponse("access-1"))
        respond(200, {id: 1, email: "test@example.com", name: "Test", ftp: 250})

        await new WattwerkClient().profile()

        expect(calls).toHaveLength(2)
        expect(calls[0].url).toBe("http://api.test/auth/login")
        expect(calls[0].body).toEqual({email: "test@example.com", password: "geheim12345"})
        expect(calls[1].url).toBe("http://api.test/me")
        expect(calls[1].authorization).toBe("Bearer access-1")
    })

    it("meldet sich kein zweites Mal an, solange das Token gilt", async () => {
        respond(200, loginResponse("access-1"))
        respond(200, {workouts: []})
        respond(200, {collections: []})

        const client = new WattwerkClient()
        await client.ownWorkouts()
        await client.collections()

        expect(calls.map((call) => call.url)).toEqual([
            "http://api.test/auth/login",
            "http://api.test/workouts",
            "http://api.test/collections",
        ])
    })

    it("holt nach einem 401 ein neues Token und wiederholt den Aufruf genau einmal", async () => {
        respond(200, loginResponse("access-1"))
        respond(401, {error: "UNAUTHORIZED", message: "Anmeldung erforderlich."})
        respond(200, loginResponse("access-2"))
        respond(200, {workouts: []})

        await new WattwerkClient().ownWorkouts()

        expect(calls).toHaveLength(4)
        expect(calls[1].authorization).toBe("Bearer access-1")
        expect(calls[3].authorization).toBe("Bearer access-2")
    })

    it("gibt nach dem zweiten 401 auf, statt sich im Kreis zu drehen", async () => {
        respond(200, loginResponse("access-1"))
        respond(401, {error: "UNAUTHORIZED", message: "Anmeldung erforderlich."})
        respond(200, loginResponse("access-2"))
        respond(401, {error: "UNAUTHORIZED", message: "Anmeldung erforderlich."})

        await expect(new WattwerkClient().ownWorkouts()).rejects.toBeInstanceOf(WattwerkApiError)
        expect(calls).toHaveLength(4)
    })

    it("startet bei gleichzeitigen Aufrufen nur eine Anmeldung", async () => {
        respond(200, loginResponse("access-1"))
        respond(200, {workouts: []})
        respond(200, {collections: []})

        const client = new WattwerkClient()
        await Promise.all([client.ownWorkouts(), client.collections()])

        const logins = calls.filter((call) => call.url.endsWith("/auth/login"))
        expect(logins).toHaveLength(1)
    })
})

describe("Oeffentliche Routen", () => {
    it("fragt den Gesundheitszustand ohne Anmeldung ab", async () => {
        respond(200, {status: "ok", database: "up", uptimeSeconds: 10})

        await new WattwerkClient().health()

        expect(calls).toHaveLength(1)
        expect(calls[0].authorization).toBeUndefined()
    })

    it("haengt nur gesetzte Filter an die Suche", async () => {
        respond(200, {workouts: []})

        await new WattwerkClient().publicWorkouts({query: "Schwelle", limit: 5})

        expect(calls[0].url).toBe("http://api.test/workouts/public?query=Schwelle&limit=5")
    })
})

describe("Fehler", () => {
    it("reicht Code und Satz der API weiter", async () => {
        respond(200, loginResponse("access-1"))
        respond(404, {error: "NOT_FOUND", message: "Dieses Programm gibt es nicht."})

        await expect(new WattwerkClient().workout("gibt-es-nicht")).rejects.toMatchObject({
            code: "NOT_FOUND",
            status: 404,
            message: "Dieses Programm gibt es nicht.",
        })
    })

    it("macht aus einem Netzfehler eine verstaendliche Meldung", async () => {
        global.fetch = (async () => {
            throw new Error("connect ECONNREFUSED")
        }) as typeof fetch

        await expect(new WattwerkClient().health()).rejects.toMatchObject({
            code: "NETWORK",
            message: expect.stringContaining("http://api.test"),
        })
    })
})

describe("Kennungen in der Adresse", () => {
    it("kodiert, was in den Pfad wandert", async () => {
        respond(200, loginResponse("access-1"))
        respond(200, {})

        await new WattwerkClient().removeFromCollection("a/b", "c d")

        expect(calls[1].url).toBe("http://api.test/collections/a%2Fb/items/c%20d")
        expect(calls[1].method).toBe("DELETE")
    })
})
