import type {Express} from "express"
import type {TrainingSessionPayload} from "@wattwerk/shared"
import request from "supertest"
import {closeDatabase, setupTestServer, uniqueEmail} from "./helpers"

let app: Express

beforeAll(async () => {
    app = await setupTestServer()
})

afterAll(async () => {
    await closeDatabase()
})

async function registerAndGetToken(): Promise<string> {
    const response = await request(app)
        .post("/auth/register")
        .send({email: uniqueEmail(), password: "geheim12"})
        .expect(201)
    return response.body.accessToken
}

function payload(overrides: Partial<TrainingSessionPayload> = {}): TrainingSessionPayload {
    return {
        clientID: "11111111-1111-4111-8111-111111111111",
        workoutName: "Sweet Spot 3x12",
        startedAt: new Date("2026-09-19T17:30:00.000Z").toISOString(),
        durationSeconds: 3600,
        completed: true,
        ftp: 250,
        averagePower: 210,
        maxPower: 420,
        normalizedPower: 225,
        intensityFactor: 0.9,
        trainingStressScore: 81,
        kilojoules: 756,
        averageCadence: 89,
        averageHeartRate: 148,
        maxHeartRate: 176,
        ...overrides,
    }
}

describe("POST /sessions", () => {
    it("nimmt eine gefahrene Einheit an", async () => {
        const token = await registerAndGetToken()

        const response = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload())

        expect(response.status).toBe(201)
        expect(response.body.workoutName).toBe("Sweet Spot 3x12")
        expect(response.body.trainingStressScore).toBe(81)
        expect(response.body.averageHeartRate).toBe(148)
    })

    it("legt denselben Upload nicht zweimal an", async () => {
        // Die App wiederholt den Upload nach einem Netzfehler - das darf den
        // Verlauf nicht verdoppeln.
        const token = await registerAndGetToken()
        const body = payload()

        await request(app).post("/sessions").set("Authorization", `Bearer ${token}`).send(body).expect(201)
        // 200 statt 201: beim zweiten Mal wurde nichts angelegt, nur ersetzt.
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send({...body, averagePower: 215})
            .expect(200)

        const list = await request(app).get("/sessions").set("Authorization", `Bearer ${token}`)
        expect(list.body.sessions).toHaveLength(1)
        expect(list.body.sessions[0].averagePower).toBe(215)
    })

    it("weist unbrauchbare Koerper ab", async () => {
        const token = await registerAndGetToken()

        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({startedAt: "irgendwann"}))
            .expect(400)

        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({averagePower: -5}))
            .expect(400)

        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({durationSeconds: 999_999}))
            .expect(400)
    })

    it("verlangt eine Anmeldung", async () => {
        await request(app).post("/sessions").send(payload()).expect(401)
    })
})

describe("GET /sessions", () => {
    it("liefert die eigenen Einheiten, neueste zuerst", async () => {
        const token = await registerAndGetToken()

        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "aaaaaaaa-1111-4111-8111-111111111111", startedAt: "2026-09-10T10:00:00.000Z"}))
            .expect(201)
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "bbbbbbbb-1111-4111-8111-111111111111", startedAt: "2026-09-18T10:00:00.000Z"}))
            .expect(201)

        const list = await request(app).get("/sessions").set("Authorization", `Bearer ${token}`)
        expect(list.status).toBe(200)
        expect(list.body.sessions).toHaveLength(2)
        expect(new Date(list.body.sessions[0].startedAt).getTime()).toBeGreaterThan(
            new Date(list.body.sessions[1].startedAt).getTime()
        )
    })

    it("summiert die Belastung nur der letzten sieben Tage", async () => {
        const token = await registerAndGetToken()
        const now = Date.now()

        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({
                clientID: "cccccccc-1111-4111-8111-111111111111",
                startedAt: new Date(now - 2 * 86400_000).toISOString(),
                trainingStressScore: 80,
            }))
            .expect(201)
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({
                clientID: "dddddddd-1111-4111-8111-111111111111",
                startedAt: new Date(now - 30 * 86400_000).toISOString(),
                trainingStressScore: 90,
            }))
            .expect(201)

        const list = await request(app).get("/sessions").set("Authorization", `Bearer ${token}`)
        expect(list.body.stressLastSevenDays).toBe(80)
    })

    it("zeigt keine fremden Einheiten", async () => {
        const tokenA = await registerAndGetToken()
        const tokenB = await registerAndGetToken()

        await request(app).post("/sessions").set("Authorization", `Bearer ${tokenA}`).send(payload()).expect(201)

        const listB = await request(app).get("/sessions").set("Authorization", `Bearer ${tokenB}`)
        expect(listB.body.sessions).toHaveLength(0)
    })
})

describe("DELETE /sessions/:id", () => {
    it("loescht die eigene Einheit", async () => {
        const token = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload())
            .expect(201)

        await request(app)
            .delete(`/sessions/${created.body.id}`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200)

        const list = await request(app).get("/sessions").set("Authorization", `Bearer ${token}`)
        expect(list.body.sessions).toHaveLength(0)
    })

    it("laesst fremde Einheiten in Ruhe", async () => {
        // Die Kennung ist fortlaufend und damit ratbar - die Berechtigung muss
        // in der Bedingung stecken, nicht in einer Pruefung danach.
        const tokenA = await registerAndGetToken()
        const tokenB = await registerAndGetToken()

        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${tokenA}`)
            .send(payload())
            .expect(201)

        const attempt = await request(app)
            .delete(`/sessions/${created.body.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
        expect(attempt.status).toBe(404)

        const listA = await request(app).get("/sessions").set("Authorization", `Bearer ${tokenA}`)
        expect(listA.body.sessions).toHaveLength(1)
    })
})
