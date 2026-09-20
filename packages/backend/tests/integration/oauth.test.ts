import type {Express} from "express"
import {createHash, randomBytes} from "node:crypto"
import request from "supertest"
import {auth, closeDatabase, registerUser, setupTestServer, TestUser} from "./helpers"

/**
 * Der Autorisierungsserver, von aussen.
 *
 * Geprueft wird vor allem, was *nicht* geht: ein fremder redirect_uri, ein
 * zweites Einloesen desselben Codes, ein falscher code_verifier, ein Token fuer
 * einen anderen Empfaenger. Der gluecklich verlaufende Fall ist der leichteste
 * Teil daran.
 */

let app: Express
let user: TestUser
const REDIRECT = "http://localhost:7777/callback"
const RESOURCE = "https://mcp.wattwerk.eliaspeeters.de/mcp"

beforeAll(async () => {
    app = await setupTestServer()
    user = await registerUser(app)
})

afterAll(async () => {
    await closeDatabase()
})

function pkce(): {verifier: string; challenge: string} {
    const verifier = randomBytes(48).toString("base64url")
    return {verifier, challenge: createHash("sha256").update(verifier).digest("base64url")}
}

async function registerClient(name = "Testclient", redirectUris = [REDIRECT]): Promise<string> {
    const response = await request(app)
        .post("/oauth/register")
        .send({client_name: name, redirect_uris: redirectUris})
        .expect(201)
    return response.body.client_id
}

function authorizeParams(clientID: string, challenge: string, scope = "wattwerk:read wattwerk:write") {
    return {
        response_type: "code",
        client_id: clientID,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope,
        resource: RESOURCE,
    }
}

/** Geht den Weg bis zum Code. */
async function codeFor(clientID: string, challenge: string, scope?: string): Promise<string> {
    const response = await request(app)
        .post("/oauth/authorize")
        .type("form")
        .send({
            ...authorizeParams(clientID, challenge, scope),
            decision: "allow",
            email: user.email,
            password: "geheim12",
        })
        .expect(302)
    return new URL(response.headers.location).searchParams.get("code") as string
}

describe("Auffindbarkeit", () => {
    it("beschreibt sich so, wie die Spezifikation es verlangt", async () => {
        const response = await request(app).get("/.well-known/oauth-authorization-server").expect(200)

        expect(response.body.issuer).toBeDefined()
        expect(response.body.authorization_endpoint).toContain("/oauth/authorize")
        expect(response.body.token_endpoint).toContain("/oauth/token")
        // PKCE nur mit S256: `plain` waere PKCE, das nichts schuetzt.
        expect(response.body.code_challenge_methods_supported).toEqual(["S256"])
        expect(response.body.client_id_metadata_document_supported).toBe(true)
        expect(response.body.authorization_response_iss_parameter_supported).toBe(true)
    })
})

describe("Registrierung", () => {
    it("legt einen oeffentlichen Client an", async () => {
        const response = await request(app)
            .post("/oauth/register")
            .send({client_name: "Neuer Client", redirect_uris: [REDIRECT]})
            .expect(201)

        expect(response.body.client_id).toMatch(/^wc_/)
        expect(response.body.token_endpoint_auth_method).toBe("none")
        // Ein Geheimnis, das auf einem fremden Geraet liegt, ist keines.
        expect(response.body.client_secret).toBeUndefined()
    })

    it("verlangt brauchbare Weiterleitungsadressen", async () => {
        await request(app).post("/oauth/register").send({client_name: "Ohne"}).expect(400)
        await request(app)
            .post("/oauth/register")
            .send({client_name: "Unsicher", redirect_uris: ["http://fremde-seite.example/callback"]})
            .expect(400)
        await request(app)
            .post("/oauth/register")
            .send({client_name: "Eigenes Schema", redirect_uris: ["meineapp://callback"]})
            .expect(400)
    })
})

describe("Zustimmung", () => {
    it("zeigt eine Seite mit dem Namen der Anwendung", async () => {
        const clientID = await registerClient("Sprachmodell")
        const response = await request(app)
            .get("/oauth/authorize")
            .query(authorizeParams(clientID, pkce().challenge))
            .expect(200)

        expect(response.headers["content-type"]).toContain("text/html")
        expect(response.text).toContain("Sprachmodell verbinden")
        expect(response.text).toContain("Erlauben")
    })

    it("leitet bei unbekanntem Client nicht weiter, sondern zeigt den Fehler", async () => {
        const response = await request(app)
            .get("/oauth/authorize")
            .query({...authorizeParams("wc_gibtesnicht", pkce().challenge)})
            .expect(400)

        expect(response.text).toContain("unbekannt")
        expect(response.headers.location).toBeUndefined()
    })

    it("leitet bei fremder redirect_uri nicht weiter", async () => {
        const clientID = await registerClient()
        const response = await request(app)
            .get("/oauth/authorize")
            .query({...authorizeParams(clientID, pkce().challenge), redirect_uri: "http://localhost:9999/boese"})
            .expect(400)

        expect(response.text).toContain("gehört nicht zu dieser Anwendung")
        expect(response.headers.location).toBeUndefined()
    })

    it("schickt Fehler der Anfrage an den Client zurueck, sobald er geprueft ist", async () => {
        const clientID = await registerClient()
        const response = await request(app)
            .get("/oauth/authorize")
            .query({...authorizeParams(clientID, pkce().challenge), code_challenge_method: "plain"})
            .expect(302)

        const url = new URL(response.headers.location)
        expect(url.searchParams.get("error")).toBe("invalid_request")
    })

    it("lehnt Tokens fuer einen fremden Empfaenger ab", async () => {
        const clientID = await registerClient()
        const response = await request(app)
            .get("/oauth/authorize")
            .query({...authorizeParams(clientID, pkce().challenge), resource: "https://woanders.example/mcp"})
            .expect(302)

        expect(new URL(response.headers.location).searchParams.get("error")).toBe("invalid_target")
    })

    it("gibt bei Ablehnung access_denied zurueck", async () => {
        const clientID = await registerClient()
        const response = await request(app)
            .post("/oauth/authorize")
            .type("form")
            .send({
                ...authorizeParams(clientID, pkce().challenge),
                decision: "deny",
                email: user.email,
                password: "geheim12",
            })
            .expect(302)

        expect(new URL(response.headers.location).searchParams.get("error")).toBe("access_denied")
    })

    it("gibt bei falschem Passwort keinen Code", async () => {
        const clientID = await registerClient()
        const response = await request(app)
            .post("/oauth/authorize")
            .type("form")
            .send({
                ...authorizeParams(clientID, pkce().challenge),
                decision: "allow",
                email: user.email,
                password: "falschfalsch",
            })
            .expect(401)

        expect(response.text).toContain("stimmt nicht")
    })

    it("gibt state und iss zurueck", async () => {
        const clientID = await registerClient()
        const response = await request(app)
            .post("/oauth/authorize")
            .type("form")
            .send({
                ...authorizeParams(clientID, pkce().challenge),
                state: "zustand-123",
                decision: "allow",
                email: user.email,
                password: "geheim12",
            })
            .expect(302)

        const url = new URL(response.headers.location)
        expect(url.searchParams.get("state")).toBe("zustand-123")
        // RFC 9207: daran erkennt der Client, dass die Antwort von dem Server
        // kommt, den er gefragt hat.
        expect(url.searchParams.get("iss")).toBeTruthy()
    })
})

describe("Code einloesen", () => {
    it("liefert Tokens, die an den Empfaenger gebunden sind", async () => {
        const clientID = await registerClient()
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge)

        const response = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientID,
                redirect_uri: REDIRECT,
            })
            .expect(200)

        expect(response.body.token_type).toBe("Bearer")
        expect(response.body.refresh_token).toMatch(/^wro_/)
        expect(response.headers["cache-control"]).toContain("no-store")

        const payload = JSON.parse(
            Buffer.from(response.body.access_token.split(".")[1], "base64url").toString("utf8")
        )
        expect(payload.aud).toBe(RESOURCE)
        expect(payload.scope).toBe("wattwerk:read wattwerk:write")
        expect(payload.userID).toBe(user.userID)
    })

    it("nimmt denselben Code kein zweites Mal", async () => {
        const clientID = await registerClient()
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge)
        const body = {
            grant_type: "authorization_code",
            code,
            code_verifier: verifier,
            client_id: clientID,
            redirect_uri: REDIRECT,
        }

        await request(app).post("/oauth/token").type("form").send(body).expect(200)
        const second = await request(app).post("/oauth/token").type("form").send(body).expect(400)
        expect(second.body.error).toBe("invalid_grant")
    })

    it("verlangt den passenden code_verifier", async () => {
        const clientID = await registerClient()
        const {challenge} = pkce()
        const code = await codeFor(clientID, challenge)

        const response = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: randomBytes(48).toString("base64url"),
                client_id: clientID,
                redirect_uri: REDIRECT,
            })
            .expect(400)

        expect(response.body.error_description).toContain("code_verifier")
    })

    it("gibt den Code nicht an eine andere Anwendung", async () => {
        const clientID = await registerClient()
        const anderer = await registerClient("Anderer")
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge)

        await request(app)
            .post("/oauth/token")
            .type("form")
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: anderer,
                redirect_uri: REDIRECT,
            })
            .expect(400)
    })

    it("kennt nur die beiden vorgesehenen Arten", async () => {
        const response = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "password", username: user.email, password: "geheim12"})
            .expect(400)
        expect(response.body.error).toBe("unsupported_grant_type")
    })
})

describe("Auffrischen", () => {
    it("tauscht das Auffrischungstoken jedes Mal aus", async () => {
        const clientID = await registerClient()
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge)
        const first = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientID, redirect_uri: REDIRECT})
            .expect(200)

        const refreshed = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "refresh_token", refresh_token: first.body.refresh_token, client_id: clientID})
            .expect(200)

        expect(refreshed.body.refresh_token).not.toBe(first.body.refresh_token)

        // Das alte ist danach tot - taucht es wieder auf, ist es abgegriffen.
        await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "refresh_token", refresh_token: first.body.refresh_token, client_id: clientID})
            .expect(400)
    })
})

describe("Verbindungen im Portal", () => {
    it("listet die erteilte Verbindung und nimmt sie zurueck", async () => {
        const clientID = await registerClient("Sichtbarer Client")
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge)
        const tokens = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientID, redirect_uri: REDIRECT})
            .expect(200)

        const list = await request(app).get("/me/connections").set(...auth(user.token)).expect(200)
        const entry = list.body.connections.find((c: {clientID: string}) => c.clientID === clientID)
        expect(entry).toBeDefined()
        expect(entry.clientName).toBe("Sichtbarer Client")

        await request(app).delete(`/me/connections/${entry.id}`).set(...auth(user.token)).expect(200)

        // Danach laesst sich nichts mehr auffrischen.
        await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "refresh_token", refresh_token: tokens.body.refresh_token, client_id: clientID})
            .expect(400)
    })

    it("laesst ein OAuth-Token die Verbindungen nicht selbst verwalten", async () => {
        const clientID = await registerClient()
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge)
        const tokens = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientID, redirect_uri: REDIRECT})
            .expect(200)

        // Sonst trennte eine verbundene Anwendung einfach die Konkurrenz - oder
        // sich selbst wieder hinein.
        await request(app).get("/me/connections").set(...auth(tokens.body.access_token)).expect(403)
        await request(app).get("/me/keys").set(...auth(tokens.body.access_token)).expect(403)
        await request(app)
            .post("/me/delete")
            .set(...auth(tokens.body.access_token))
            .send({password: "geheim12"})
            .expect(403)
    })

    it("laesst ein Nur-Lesen-Token nicht schreiben", async () => {
        const clientID = await registerClient()
        const {verifier, challenge} = pkce()
        const code = await codeFor(clientID, challenge, "wattwerk:read")
        const tokens = await request(app)
            .post("/oauth/token")
            .type("form")
            .send({grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientID, redirect_uri: REDIRECT})
            .expect(200)

        expect(tokens.body.scope).toBe("wattwerk:read")
        await request(app).get("/workouts").set(...auth(tokens.body.access_token)).expect(200)
        await request(app)
            .post("/workouts")
            .set(...auth(tokens.body.access_token))
            .send({name: "Darf nicht", segments: [{durationSeconds: 600, target: {type: "free"}}]})
            .expect(403)
    })
})
