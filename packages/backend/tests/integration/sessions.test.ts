import type {Express} from "express"
import type {RideTrackDTO, TrainingSessionPayload} from "@wattwerk/shared"
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

function sampleTrack(seconds = 5): RideTrackDTO {
    return {
        sampleIntervalSeconds: 1,
        sampleCount: seconds,
        startOffsetSeconds: 0,
        power: Array.from({length: seconds}, (_, index) => 150 + index),
        targetPower: Array.from({length: seconds}, () => 200),
        heartRate: Array.from({length: seconds}, (_, index) => (index === 1 ? null : 140 + index)),
        cadence: Array.from({length: seconds}, () => 88),
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

describe("Sekundenverlauf", () => {
    it("nimmt die Spur an und gibt sie wieder heraus", async () => {
        const token = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "10000000-1111-4111-8111-111111111111", track: sampleTrack()}))
            .expect(201)

        expect(created.body.hasTrack).toBe(true)

        const track = await request(app)
            .get(`/sessions/${created.body.id}/track`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200)

        expect(track.body.sessionID).toBe(created.body.id)
        expect(track.body.track.power).toEqual([150, 151, 152, 153, 154])
        // Die Luecke bleibt eine Luecke: dort war der Pulsgurt weg.
        expect(track.body.track.heartRate[1]).toBeNull()
        // Eine Spalte, die es nie gab, kommt auch nicht zurueck.
        expect(track.body.track.speed).toBeUndefined()
    })

    it("meldet im Verlauf, welche Einheiten eine Spur haben", async () => {
        const token = await registerAndGetToken()
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "20000000-1111-4111-8111-111111111111", track: sampleTrack()}))
            .expect(201)
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "20000000-2222-4111-8111-111111111111"}))
            .expect(201)

        const list = await request(app).get("/sessions").set("Authorization", `Bearer ${token}`)
        const byClient = new Map<string, boolean>(
            list.body.sessions.map((session: {clientID: string; hasTrack: boolean}) => [
                session.clientID,
                session.hasTrack,
            ])
        )
        expect(byClient.get("20000000-1111-4111-8111-111111111111")).toBe(true)
        expect(byClient.get("20000000-2222-4111-8111-111111111111")).toBe(false)
    })

    it("nimmt eine Einheit ohne Spur an - Version 1.0 kennt das Feld nicht", async () => {
        const token = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "30000000-1111-4111-8111-111111111111"}))
            .expect(201)

        expect(created.body.hasTrack).toBe(false)
        await request(app)
            .get(`/sessions/${created.body.id}/track`)
            .set("Authorization", `Bearer ${token}`)
            .expect(404)
    })

    it("laesst eine vorhandene Spur stehen, wenn der zweite Upload keine mitbringt", async () => {
        // Genau der Fall Apple TV: der Mac hat die Kurve geliefert, der
        // Fernseher traegt dieselbe Einheit ohne nach - und darf sie dabei
        // nicht mitnehmen.
        const token = await registerAndGetToken()
        const body = payload({clientID: "40000000-1111-4111-8111-111111111111", track: sampleTrack()})

        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(body)
            .expect(201)

        const again = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "40000000-1111-4111-8111-111111111111", averagePower: 215}))
            .expect(200)

        expect(again.body.hasTrack).toBe(true)
        const track = await request(app)
            .get(`/sessions/${created.body.id}/track`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200)
        expect(track.body.track.power).toHaveLength(5)
    })

    it("ersetzt die Spur, wenn der zweite Upload eine mitbringt", async () => {
        const token = await registerAndGetToken()
        const clientID = "50000000-1111-4111-8111-111111111111"

        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID, track: sampleTrack(5)}))
            .expect(201)
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID, track: sampleTrack(9)}))
            .expect(200)

        const track = await request(app)
            .get(`/sessions/${created.body.id}/track`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200)
        expect(track.body.track.power).toHaveLength(9)
        expect(track.body.track.sampleCount).toBe(9)
    })

    it("weist eine unbrauchbare Spur ab, ohne die Einheit anzulegen", async () => {
        const token = await registerAndGetToken()
        await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(
                payload({
                    clientID: "60000000-1111-4111-8111-111111111111",
                    track: {...sampleTrack(), cadence: [80, 85]},
                })
            )
            .expect(400)

        const list = await request(app).get("/sessions").set("Authorization", `Bearer ${token}`)
        expect(list.body.sessions).toHaveLength(0)
    })

    it("zeigt keine fremde Spur", async () => {
        const tokenA = await registerAndGetToken()
        const tokenB = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${tokenA}`)
            .send(payload({clientID: "70000000-1111-4111-8111-111111111111", track: sampleTrack()}))
            .expect(201)

        // 404 und nicht 403: sonst verriete die Antwort, dass es zu dieser
        // Kennung ueberhaupt eine Einheit gibt.
        await request(app)
            .get(`/sessions/${created.body.id}/track`)
            .set("Authorization", `Bearer ${tokenB}`)
            .expect(404)
    })

    it("nimmt die Spur mit, wenn die Einheit geloescht wird", async () => {
        const token = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "80000000-1111-4111-8111-111111111111", track: sampleTrack()}))
            .expect(201)

        await request(app)
            .delete(`/sessions/${created.body.id}`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200)
        await request(app)
            .get(`/sessions/${created.body.id}/track`)
            .set("Authorization", `Bearer ${token}`)
            .expect(404)
    })
})

describe("GET /sessions/:id", () => {
    it("liefert die einzelne Einheit", async () => {
        const token = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send(payload({clientID: "90000000-1111-4111-8111-111111111111"}))
            .expect(201)

        const single = await request(app)
            .get(`/sessions/${created.body.id}`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200)
        expect(single.body.workoutName).toBe("Sweet Spot 3x12")
    })

    it("laesst fremde Einheiten in Ruhe", async () => {
        const tokenA = await registerAndGetToken()
        const tokenB = await registerAndGetToken()
        const created = await request(app)
            .post("/sessions")
            .set("Authorization", `Bearer ${tokenA}`)
            .send(payload({clientID: "a0000000-1111-4111-8111-111111111111"}))
            .expect(201)

        await request(app)
            .get(`/sessions/${created.body.id}`)
            .set("Authorization", `Bearer ${tokenB}`)
            .expect(404)
    })
})
