import type {Express} from "express"
import {randomUUID} from "node:crypto"
import request from "supertest"
import {auth, closeDatabase, registerUser, sampleSegments, setupTestServer} from "./helpers"

let app: Express

beforeAll(async () => {
    app = await setupTestServer()
})

afterAll(async () => {
    await closeDatabase()
})

describe("POST /workouts", () => {
    it("legt ein Programm an, standardmäßig privat", async () => {
        const user = await registerUser(app)

        const response = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Mein Block", summary: "Selbst gebaut", segments: sampleSegments()})

        expect(response.status).toBe(201)
        expect(response.body.name).toBe("Mein Block")
        // Privat, solange niemand etwas anderes sagt - Freigeben ist eine
        // bewusste Entscheidung, kein Standard.
        expect(response.body.visibility).toBe("private")
        expect(response.body.ownerUserID).toBe(user.userID)
        expect(response.body.ownerName).toBe("Testfahrer")
        expect(response.body.isBuiltIn).toBe(false)
        expect(response.body.segments).toHaveLength(3)
    })

    it("rechnet Dauer und Belastung selbst aus", async () => {
        const user = await registerUser(app)

        const response = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({
                name: "Gelogen",
                segments: sampleSegments(),
                // Was der Client behauptet, zählt nicht: sonst hinge die
                // Sortierung der Übersicht daran, was jemand mitschickt.
                plannedTSS: 9999,
            })
            .expect(201)

        expect(response.body.durationSeconds).toBe(2100)
        expect(response.body.plannedTSS).toBeGreaterThan(20)
        expect(response.body.plannedTSS).toBeLessThan(80)
    })

    it("nimmt die Kennung vom Client an, damit Anlegen und Abgleich dasselbe sind", async () => {
        const user = await registerUser(app)
        // Frische Kennung je Lauf: die Tabelle wird zwischen den Läufen nicht
        // geleert, und eine feste Kennung gehörte ab dem zweiten Lauf schon
        // einem anderen Konto.
        const id = randomUUID()

        await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({id, name: "Erste Fassung", segments: sampleSegments()})
            .expect(201)

        const second = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({id, name: "Zweite Fassung", segments: sampleSegments()})
        expect(second.status).toBe(200)
        expect(second.body.name).toBe("Zweite Fassung")

        const list = await request(app).get("/workouts").set(...auth(user.token))
        expect(list.body.workouts.filter((w: {id: string}) => w.id === id)).toHaveLength(1)
    })

    it("weist unbrauchbare Blöcke ab", async () => {
        const user = await registerUser(app)

        const noName = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "  ", segments: sampleSegments()})
        expect(noName.status).toBe(400)

        const noSegments = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Leer", segments: []})
        expect(noSegments.status).toBe(400)

        const badTarget = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Kaputt", segments: [{durationSeconds: 60, target: {type: "kernfusion"}}]})
        expect(badTarget.status).toBe(400)

        const absurd = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({
                name: "Zu lang",
                segments: [{durationSeconds: 60, target: {type: "watts", value: 99999}}],
            })
        expect(absurd.status).toBe(400)
    })

    it("verlangt eine Anmeldung", async () => {
        await request(app).post("/workouts").send({name: "X", segments: sampleSegments()}).expect(401)
    })
})

describe("Sichtbarkeit", () => {
    it("zeigt fremde private Programme nicht einmal als vorhanden", async () => {
        const owner = await registerUser(app)
        const stranger = await registerUser(app)

        const created = await request(app)
            .post("/workouts")
            .set(...auth(owner.token))
            .send({name: "Geheim", segments: sampleSegments()})
            .expect(201)

        // 404 statt 403: alles andere verrät, dass es das Programm gibt.
        await request(app)
            .get(`/workouts/${created.body.id}`)
            .set(...auth(stranger.token))
            .expect(404)

        const publicList = await request(app).get("/workouts/public")
        const ids = publicList.body.workouts.map((w: {id: string}) => w.id)
        expect(ids).not.toContain(created.body.id)
    })

    it("macht ein freigegebenes Programm für alle sichtbar", async () => {
        const owner = await registerUser(app)
        const stranger = await registerUser(app)

        const created = await request(app)
            .post("/workouts")
            .set(...auth(owner.token))
            .send({name: "Geteilt", visibility: "public", segments: sampleSegments()})
            .expect(201)
        expect(created.body.visibility).toBe("public")

        const seen = await request(app)
            .get(`/workouts/${created.body.id}`)
            .set(...auth(stranger.token))
        expect(seen.status).toBe(200)
        expect(seen.body.ownerName).toBe("Testfahrer")

        // Auch ohne Anmeldung, für die Landingpage.
        await request(app).get(`/workouts/${created.body.id}`).expect(200)
    })

    it("listet eigene Programme unabhängig von der Sichtbarkeit", async () => {
        const user = await registerUser(app)
        await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Privat", segments: sampleSegments()})
            .expect(201)
        await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Öffentlich", visibility: "public", segments: sampleSegments()})
            .expect(201)

        const list = await request(app).get("/workouts").set(...auth(user.token))
        expect(list.body.workouts).toHaveLength(2)
    })
})

describe("Ändern und Löschen", () => {
    it("lässt fremde Programme in Ruhe", async () => {
        const owner = await registerUser(app)
        const stranger = await registerUser(app)

        const created = await request(app)
            .post("/workouts")
            .set(...auth(owner.token))
            .send({name: "Meins", visibility: "public", segments: sampleSegments()})
            .expect(201)

        await request(app)
            .put(`/workouts/${created.body.id}`)
            .set(...auth(stranger.token))
            .send({name: "Gekapert", segments: sampleSegments()})
            .expect(403)

        await request(app)
            .delete(`/workouts/${created.body.id}`)
            .set(...auth(stranger.token))
            .expect(404)

        const unchanged = await request(app).get(`/workouts/${created.body.id}`)
        expect(unchanged.body.name).toBe("Meins")
    })

    it("schützt den mitgelieferten Katalog", async () => {
        const user = await registerUser(app)
        // Aus der Migration, dieselbe Kennung wie in der App.
        const builtInID = "a1000000-0000-4000-8000-000000000002"

        await request(app)
            .put(`/workouts/${builtInID}`)
            .set(...auth(user.token))
            .send({name: "Umgeschrieben", segments: sampleSegments()})
            .expect(403)

        await request(app)
            .delete(`/workouts/${builtInID}`)
            .set(...auth(user.token))
            .expect(404)

        const intact = await request(app).get(`/workouts/${builtInID}`)
        expect(intact.body.name).toBe("Sweet Spot 3×12")
        expect(intact.body.isBuiltIn).toBe(true)
    })

    it("löscht eigene Programme", async () => {
        const user = await registerUser(app)
        const created = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Weg damit", segments: sampleSegments()})
            .expect(201)

        await request(app)
            .delete(`/workouts/${created.body.id}`)
            .set(...auth(user.token))
            .expect(200)

        const list = await request(app).get("/workouts").set(...auth(user.token))
        expect(list.body.workouts).toHaveLength(0)
    })
})

describe("POST /workouts/sync", () => {
    it("bringt mit, was offline entstanden ist", async () => {
        const user = await registerUser(app)
        const first = randomUUID()

        const response = await request(app)
            .post("/workouts/sync")
            .set(...auth(user.token))
            .send({
                workouts: [
                    {id: first, name: "Lokal 1", segments: sampleSegments()},
                    {id: randomUUID(), name: "Lokal 2", segments: sampleSegments()},
                ],
            })

        expect(response.status).toBe(200)
        expect(response.body.workouts).toHaveLength(2)

        // Zweiter Anlauf nach einem Netzfehler verdoppelt nichts.
        const again = await request(app)
            .post("/workouts/sync")
            .set(...auth(user.token))
            .send({
                workouts: [{id: first, name: "Lokal 1", segments: sampleSegments()}],
            })
        expect(again.body.workouts).toHaveLength(2)
    })

    it("lehnt den ganzen Schwung ab, wenn ein Programm kaputt ist", async () => {
        const user = await registerUser(app)
        await request(app)
            .post("/workouts/sync")
            .set(...auth(user.token))
            .send({workouts: [{name: "", segments: sampleSegments()}]})
            .expect(400)
    })
})

describe("GET /workouts/public", () => {
    it("findet über Namen und Schlagworte", async () => {
        const user = await registerUser(app)
        const marker = `Bergfahrt-${Date.now()}`
        await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({
                name: marker,
                visibility: "public",
                tags: ["Berg", "Hart"],
                segments: sampleSegments(),
            })
            .expect(201)

        const byName = await request(app).get("/workouts/public").query({query: marker})
        expect(byName.body.workouts.map((w: {name: string}) => w.name)).toContain(marker)

        const byTag = await request(app).get("/workouts/public").query({tag: "Berg", limit: 50})
        expect(byTag.body.workouts.map((w: {name: string}) => w.name)).toContain(marker)

        const missing = await request(app).get("/workouts/public").query({query: "gibtesnicht-xyz"})
        expect(missing.body.workouts).toHaveLength(0)
    })

    it("filtert nach Dauer", async () => {
        const short = await request(app)
            .get("/workouts/public")
            .query({maxDurationSeconds: 1900, limit: 50})
        for (const workout of short.body.workouts) {
            expect(workout.durationSeconds).toBeLessThanOrEqual(1900)
        }
    })
})
