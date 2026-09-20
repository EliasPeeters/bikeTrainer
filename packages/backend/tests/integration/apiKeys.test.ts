import type {Express} from "express"
import request from "supertest"
import {auth, closeDatabase, registerUser, setupTestServer, TestUser} from "./helpers"

let app: Express
let user: TestUser

beforeAll(async () => {
    app = await setupTestServer()
    user = await registerUser(app)
})

afterAll(async () => {
    await closeDatabase()
})

async function createKey(body: Record<string, unknown> = {name: "Test"}): Promise<{id: number; token: string}> {
    const response = await request(app).post("/me/keys").set(...auth(user.token)).send(body).expect(201)
    return {id: response.body.key.id, token: response.body.token}
}

describe("POST /me/keys", () => {
    it("liefert den Schluessel genau einmal", async () => {
        const response = await request(app)
            .post("/me/keys")
            .set(...auth(user.token))
            .send({name: "Claude auf dem Mac"})
            .expect(201)

        expect(response.body.token).toMatch(/^wk_[A-Za-z0-9_-]{43}$/)
        expect(response.body.key.name).toBe("Claude auf dem Mac")
        expect(response.body.key.scope).toBe("full")
        expect(response.body.key.expiresAt).toBeNull()
        // In der Liste darf er nie wieder auftauchen.
        const list = await request(app).get("/me/keys").set(...auth(user.token)).expect(200)
        const listed = list.body.keys.find((key: {id: number}) => key.id === response.body.key.id)
        expect(listed).toBeDefined()
        expect(JSON.stringify(listed)).not.toContain(response.body.token)
    })

    it("verlangt einen Namen", async () => {
        await request(app).post("/me/keys").set(...auth(user.token)).send({}).expect(400)
        await request(app).post("/me/keys").set(...auth(user.token)).send({name: "   "}).expect(400)
    })

    it("weist unbrauchbare Ablaufangaben ab", async () => {
        await request(app)
            .post("/me/keys")
            .set(...auth(user.token))
            .send({name: "Kaputt", expiresInDays: 0})
            .expect(400)
        await request(app)
            .post("/me/keys")
            .set(...auth(user.token))
            .send({name: "Kaputt", expiresInDays: 99999})
            .expect(400)
    })

    it("setzt ein Ablaufdatum, wenn eines gewuenscht ist", async () => {
        const response = await request(app)
            .post("/me/keys")
            .set(...auth(user.token))
            .send({name: "Befristet", expiresInDays: 30})
            .expect(201)
        const expires = new Date(response.body.key.expiresAt).getTime()
        expect(expires).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000)
        expect(expires).toBeLessThan(Date.now() + 31 * 24 * 3600 * 1000)
    })
})

describe("Anmelden mit einem Schluessel", () => {
    it("ersetzt das Zugangstoken", async () => {
        const key = await createKey({name: "Voll"})
        const response = await request(app).get("/me").set(...auth(key.token)).expect(200)
        expect(response.body.id).toBe(user.userID)
    })

    it("darf mit vollem Recht auch schreiben", async () => {
        const key = await createKey({name: "Voll"})
        await request(app)
            .post("/workouts")
            .set(...auth(key.token))
            .send({name: "Per Schlüssel", segments: [{durationSeconds: 600, target: {type: "free"}}]})
            .expect(201)
    })

    it("laesst einen Lese-Schluessel nicht schreiben", async () => {
        const key = await createKey({name: "Nur lesen", scope: "read"})

        await request(app).get("/workouts").set(...auth(key.token)).expect(200)

        const blocked = await request(app)
            .post("/workouts")
            .set(...auth(key.token))
            .send({name: "Darf nicht", segments: [{durationSeconds: 600, target: {type: "free"}}]})
            .expect(403)
        expect(blocked.body.message).toContain("nur lesen")

        await request(app).delete("/workouts/egal").set(...auth(key.token)).expect(403)
    })

    it("weist einen erfundenen Schluessel ab", async () => {
        await request(app).get("/me").set(...auth("wk_dasgibtesnicht")).expect(401)
    })
})

describe("Was ein Schluessel nicht darf", () => {
    it("keine Schluessel verwalten - sonst verlaengert er sich selbst", async () => {
        const key = await createKey({name: "Voll"})
        await request(app).get("/me/keys").set(...auth(key.token)).expect(403)
        await request(app).post("/me/keys").set(...auth(key.token)).send({name: "Zweiter"}).expect(403)
        await request(app).delete("/me/keys/1").set(...auth(key.token)).expect(403)
    })

    it("das Konto nicht loeschen", async () => {
        const key = await createKey({name: "Voll"})
        await request(app)
            .post("/me/delete")
            .set(...auth(key.token))
            .send({password: "geheim12"})
            .expect(403)
    })
})

describe("DELETE /me/keys/:id", () => {
    it("nimmt den Schluessel sofort zurueck", async () => {
        const key = await createKey({name: "Wegwerf"})
        await request(app).get("/me").set(...auth(key.token)).expect(200)

        await request(app).delete(`/me/keys/${key.id}`).set(...auth(user.token)).expect(200)

        await request(app).get("/me").set(...auth(key.token)).expect(401)
    })

    it("laesst andere Schluessel in Ruhe", async () => {
        const first = await createKey({name: "Erster"})
        const second = await createKey({name: "Zweiter"})

        await request(app).delete(`/me/keys/${first.id}`).set(...auth(user.token)).expect(200)

        await request(app).get("/me").set(...auth(second.token)).expect(200)
    })

    it("nimmt keine fremden Schluessel zurueck", async () => {
        const stranger = await registerUser(app, "Fremder")
        const key = await createKey({name: "Meiner"})

        await request(app).delete(`/me/keys/${key.id}`).set(...auth(stranger.token)).expect(404)

        // Und er funktioniert weiterhin.
        await request(app).get("/me").set(...auth(key.token)).expect(200)
    })
})
