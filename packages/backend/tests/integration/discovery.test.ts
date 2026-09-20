import type {Express} from "express"
import request from "supertest"
import {auth, closeDatabase, registerUser, sampleSegments, setupTestServer} from "./helpers"

let app: Express

beforeAll(async () => {
    app = await setupTestServer()
})

afterAll(async () => {
    await closeDatabase()
})

describe("GET /discover", () => {
    it("liefert auch ohne Anmeldung Reihen", async () => {
        // Die Landingpage zeigt den Katalog, bevor sich jemand registriert.
        const response = await request(app).get("/discover")

        expect(response.status).toBe(200)
        expect(Array.isArray(response.body.rows)).toBe(true)
        expect(response.body.rows.length).toBeGreaterThan(0)
        expect(response.body.collections).toHaveLength(0)

        const keys = response.body.rows.map((row: {key: string}) => row.key)
        expect(keys).toContain("catalog")
        // Persönliche Reihen gibt es ohne Konto nicht.
        expect(keys).not.toContain("own")
    })

    it("lässt keine Reihe leer", async () => {
        // Eine Überschrift ohne Inhalt ist kein Angebot.
        const response = await request(app).get("/discover")
        for (const row of response.body.rows) {
            expect(row.workouts.length).toBeGreaterThan(0)
            expect(typeof row.title).toBe("string")
        }
    })

    it("zeigt den mitgelieferten Katalog", async () => {
        const response = await request(app).get("/discover")
        const catalog = response.body.rows.find((row: {key: string}) => row.key === "catalog")

        expect(catalog.workouts.length).toBeGreaterThanOrEqual(10)
        for (const workout of catalog.workouts) {
            expect(workout.isBuiltIn).toBe(true)
            expect(workout.visibility).toBe("public")
        }
        expect(catalog.workouts.map((w: {name: string}) => w.name)).toContain("Rampentest (FTP)")
    })

    it("nimmt eigene Programme und Sammlungen dazu, sobald man angemeldet ist", async () => {
        const user = await registerUser(app)
        await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Ganz privat", segments: sampleSegments()})
            .expect(201)
        await request(app)
            .post("/collections")
            .set(...auth(user.token))
            .send({name: "Mein Ordner"})
            .expect(201)

        const response = await request(app).get("/discover").set(...auth(user.token))
        const own = response.body.rows.find((row: {key: string}) => row.key === "own")

        expect(own.workouts.map((w: {name: string}) => w.name)).toContain("Ganz privat")
        expect(response.body.collections.map((c: {name: string}) => c.name)).toContain("Mein Ordner")
    })

    it("zeigt fremden Nutzern die privaten Programme nicht", async () => {
        const owner = await registerUser(app)
        const stranger = await registerUser(app)
        await request(app)
            .post("/workouts")
            .set(...auth(owner.token))
            .send({name: "Nur für mich", segments: sampleSegments()})
            .expect(201)

        const response = await request(app).get("/discover").set(...auth(stranger.token))
        const allNames = response.body.rows.flatMap((row: {workouts: {name: string}[]}) =>
            row.workouts.map((workout) => workout.name)
        )
        expect(allNames).not.toContain("Nur für mich")
    })

    it("merkt sich, was zuletzt gefahren wurde", async () => {
        const user = await registerUser(app)
        const workout = await request(app)
            .post("/workouts")
            .set(...auth(user.token))
            .send({name: "Gefahren", segments: sampleSegments()})
            .expect(201)

        await request(app)
            .post("/sessions")
            .set(...auth(user.token))
            .send({
                clientID: "cafe0000-1111-4111-8111-111111111111",
                workoutName: "Gefahren",
                workoutID: workout.body.id,
                startedAt: new Date().toISOString(),
                durationSeconds: 2100,
                completed: true,
                ftp: 250,
                averagePower: 200,
                maxPower: 300,
                normalizedPower: 210,
                intensityFactor: 0.84,
                trainingStressScore: 60,
                kilojoules: 420,
            })
            .expect(201)

        const response = await request(app).get("/discover").set(...auth(user.token))
        const row = response.body.rows.find((r: {key: string}) => r.key === "continue")
        expect(row.workouts.map((w: {id: string}) => w.id)).toContain(workout.body.id)
    })
})
