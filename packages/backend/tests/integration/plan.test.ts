import type {Express} from "express"
import {randomUUID} from "node:crypto"
import request from "supertest"
import {DBPlanEntry} from "../../src/db/DBPlanEntry"
import {auth, closeDatabase, registerUser, sampleSegments, setupTestServer, TestUser} from "./helpers"

let app: Express

beforeAll(async () => {
    app = await setupTestServer()
})

afterAll(async () => {
    await closeDatabase()
})

/** Aus dem mitgelieferten Katalog (V2), gehört niemandem. */
const BUILT_IN_SWEET_SPOT = "a1000000-0000-4000-8000-000000000002"

async function createWorkout(user: TestUser, name: string, visibility = "private"): Promise<string> {
    const response = await request(app)
        .post("/workouts")
        .set(...auth(user.token))
        .send({name, visibility, segments: sampleSegments()})
        .expect(201)
    return response.body.id
}

function entry(weekday: number, workoutID: string, workoutName: string, extra: Record<string, unknown> = {}) {
    return {id: randomUUID(), weekday, workoutID, workoutName, ...extra}
}

async function savePlan(user: TestUser, entries: unknown[]) {
    return await request(app).put("/plan").set(...auth(user.token)).send({entries})
}

describe("Wochenplan", () => {
    it("ist für ein neues Konto leer", async () => {
        const user = await registerUser(app)
        const response = await request(app).get("/plan").set(...auth(user.token))
        expect(response.status).toBe(200)
        expect(response.body).toEqual({entries: []})
    })

    it("speichert den Plan und liefert ihn nach Wochentag und Reihenfolge zurück", async () => {
        const user = await registerUser(app)
        const own = await createWorkout(user, "Eigenes")

        const sunday = entry(7, own, "Eigenes")
        const tuesdayLate = entry(2, BUILT_IN_SWEET_SPOT, "Sweet Spot 3×12", {sortIndex: 5})
        const tuesdayEarly = entry(2, own, "Eigenes", {sortIndex: 1})
        const monday = entry(1, BUILT_IN_SWEET_SPOT, "Sweet Spot 3×12")

        const saved = await savePlan(user, [sunday, tuesdayLate, tuesdayEarly, monday])
        expect(saved.status).toBe(200)

        const loaded = await request(app).get("/plan").set(...auth(user.token)).expect(200)
        // PUT antwortet mit genau dem, was GET danach liefert.
        expect(saved.body).toEqual(loaded.body)
        expect(loaded.body.entries.map((e: {id: string}) => e.id)).toEqual([
            monday.id,
            tuesdayEarly.id,
            tuesdayLate.id,
            sunday.id,
        ])
        expect(loaded.body.entries[0]).toMatchObject({
            weekday: 1,
            workoutID: BUILT_IN_SWEET_SPOT,
            workoutName: "Sweet Spot 3×12",
            sortIndex: 0,
        })
    })

    it("zählt ohne sortIndex die Position innerhalb des Tages", async () => {
        const user = await registerUser(app)
        const first = entry(3, BUILT_IN_SWEET_SPOT, "Erste")
        const other = entry(4, BUILT_IN_SWEET_SPOT, "Anderer Tag")
        const second = entry(3, BUILT_IN_SWEET_SPOT, "Zweite")

        const response = await savePlan(user, [first, other, second]).then((r) => r.body)
        expect(response.entries.map((e: {id: string; sortIndex: number}) => [e.id, e.sortIndex])).toEqual([
            [first.id, 0],
            [second.id, 1],
            [other.id, 0],
        ])
    })

    it("schreibt Kennungen klein und kürzt den Namen", async () => {
        const user = await registerUser(app)
        const id = randomUUID().toUpperCase()
        const response = await savePlan(user, [
            {id, weekday: 5, workoutID: BUILT_IN_SWEET_SPOT.toUpperCase(), workoutName: `  ${"x".repeat(250)}  `},
        ])
        expect(response.status).toBe(200)
        expect(response.body.entries[0].id).toBe(id.toLowerCase())
        expect(response.body.entries[0].workoutID).toBe(BUILT_IN_SWEET_SPOT)
        expect(response.body.entries[0].workoutName).toBe("x".repeat(200))
        // Mit der kleingeschriebenen Kennung findet sich auch das Programm.
        expect(response.body.entries[0].workout?.id).toBe(BUILT_IN_SWEET_SPOT)
    })

    it("löst eigene, mitgelieferte und öffentliche Programme auf", async () => {
        const user = await registerUser(app, "Planerin")
        const author = await registerUser(app, "Urheber")
        const own = await createWorkout(user, "Mein Programm")
        const shared = await createWorkout(author, "Geteiltes", "public")

        const response = await savePlan(user, [
            entry(1, own, "Mein Programm"),
            entry(2, BUILT_IN_SWEET_SPOT, "Sweet Spot 3×12"),
            entry(3, shared, "Geteiltes"),
        ])
        expect(response.status).toBe(200)

        const [mine, builtIn, foreign] = response.body.entries
        expect(mine.workout).toMatchObject({id: own, name: "Mein Programm", ownerName: "Planerin"})
        expect(builtIn.workout).toMatchObject({id: BUILT_IN_SWEET_SPOT, isBuiltIn: true, ownerName: null})
        expect(foreign.workout).toMatchObject({id: shared, visibility: "public", ownerName: "Urheber"})
        expect(foreign.workout.segments).toHaveLength(3)
    })

    it("zeigt fremde private und unbekannte Programme nicht, behält aber den Namen", async () => {
        // Sonst wäre der Plan ein Weg, fremde private Programme zu lesen: man
        // müsste nur ihre Kennung einplanen.
        const user = await registerUser(app)
        const owner = await registerUser(app)
        const secret = await createWorkout(owner, "Geheim")
        const unknown = randomUUID()

        const response = await savePlan(user, [
            entry(1, secret, "Geheim, aber gemerkt"),
            entry(2, unknown, "Gibt es nicht mehr"),
        ])
        expect(response.status).toBe(200)
        expect(response.body.entries[0]).toMatchObject({workoutID: secret, workoutName: "Geheim, aber gemerkt", workout: null})
        expect(response.body.entries[1]).toMatchObject({workoutID: unknown, workoutName: "Gibt es nicht mehr", workout: null})
    })

    it("überlebt das Löschen des eingeplanten Programms", async () => {
        const user = await registerUser(app)
        const workoutID = await createWorkout(user, "Vergänglich")
        await savePlan(user, [entry(6, workoutID, "Vergänglich")]).then((r) => expect(r.status).toBe(200))

        await request(app).delete(`/workouts/${workoutID}`).set(...auth(user.token)).expect(200)

        const loaded = await request(app).get("/plan").set(...auth(user.token)).expect(200)
        expect(loaded.body.entries).toHaveLength(1)
        expect(loaded.body.entries[0]).toMatchObject({workoutName: "Vergänglich", workout: null})
    })

    it("ersetzt den ganzen Plan, und eine leere Liste leert ihn", async () => {
        const user = await registerUser(app)
        const keep = entry(1, BUILT_IN_SWEET_SPOT, "Bleibt")
        const drop = entry(2, BUILT_IN_SWEET_SPOT, "Fliegt raus")
        await savePlan(user, [keep, drop]).then((r) => expect(r.status).toBe(200))

        const replaced = await savePlan(user, [{...keep, weekday: 4}, entry(5, BUILT_IN_SWEET_SPOT, "Neu")])
        expect(replaced.status).toBe(200)
        expect(replaced.body.entries.map((e: {workoutName: string; weekday: number}) => [e.workoutName, e.weekday])).toEqual([
            ["Bleibt", 4],
            ["Neu", 5],
        ])

        const cleared = await savePlan(user, [])
        expect(cleared.status).toBe(200)
        expect(cleared.body.entries).toHaveLength(0)
        const loaded = await request(app).get("/plan").set(...auth(user.token)).expect(200)
        expect(loaded.body.entries).toHaveLength(0)
    })

    it("weist unbrauchbare Pläne ab und lässt den alten stehen", async () => {
        const user = await registerUser(app)
        const existing = entry(1, BUILT_IN_SWEET_SPOT, "Steht schon")
        await savePlan(user, [existing]).then((r) => expect(r.status).toBe(200))

        const duplicateID = randomUUID()
        const invalid: unknown[][] = [
            [entry(0, BUILT_IN_SWEET_SPOT, "Kein Tag")],
            [entry(8, BUILT_IN_SWEET_SPOT, "Kein Tag")],
            [entry(2.5, BUILT_IN_SWEET_SPOT, "Halber Tag")],
            [entry(1, "sweet-spot", "Keine UUID")],
            [{...entry(1, BUILT_IN_SWEET_SPOT, "Keine UUID"), id: "1234"}],
            [{id: randomUUID(), weekday: 1, workoutID: BUILT_IN_SWEET_SPOT}],
            [entry(1, BUILT_IN_SWEET_SPOT, "Negativ", {sortIndex: -1})],
            [
                {...entry(1, BUILT_IN_SWEET_SPOT, "Doppelt"), id: duplicateID},
                // Auch groß geschrieben ist es dieselbe Kennung.
                {...entry(2, BUILT_IN_SWEET_SPOT, "Doppelt"), id: duplicateID.toUpperCase()},
            ],
            Array.from({length: 51}, (_, index) => entry((index % 7) + 1, BUILT_IN_SWEET_SPOT, "Zu viel")),
            ["kein Objekt"],
        ]
        for (const entries of invalid) {
            const response = await savePlan(user, entries)
            expect(response.status).toBe(400)
            expect(response.body.error).toBe("INVALID_BODY")
            expect(typeof response.body.message).toBe("string")
        }

        await request(app).put("/plan").set(...auth(user.token)).send({}).expect(400)
        await request(app).put("/plan").set(...auth(user.token)).send({entries: "alles"}).expect(400)

        const loaded = await request(app).get("/plan").set(...auth(user.token)).expect(200)
        expect(loaded.body.entries.map((e: {id: string}) => e.id)).toEqual([existing.id])
    })

    it("nimmt genau fünfzig Einträge noch an", async () => {
        const user = await registerUser(app)
        const entries = Array.from({length: 50}, (_, index) => entry((index % 7) + 1, BUILT_IN_SWEET_SPOT, "Viel"))
        const response = await savePlan(user, entries)
        expect(response.status).toBe(200)
        expect(response.body.entries).toHaveLength(50)
    })

    it("verlangt eine Anmeldung", async () => {
        await request(app).get("/plan").expect(401)
        await request(app).put("/plan").send({entries: []}).expect(401)
    })

    it("zeigt und überschreibt keine fremden Pläne", async () => {
        const owner = await registerUser(app)
        const stranger = await registerUser(app)
        const taken = entry(3, BUILT_IN_SWEET_SPOT, "Meins")
        await savePlan(owner, [taken]).then((r) => expect(r.status).toBe(200))

        const foreign = await request(app).get("/plan").set(...auth(stranger.token)).expect(200)
        expect(foreign.body.entries).toHaveLength(0)

        // Dieselbe Kennung darf den fremden Eintrag weder übernehmen noch
        // überschreiben - und der eigene Plan bleibt dabei unangetastet.
        const own = entry(1, BUILT_IN_SWEET_SPOT, "Fremder Plan")
        await savePlan(stranger, [own]).then((r) => expect(r.status).toBe(200))
        const hijack = await savePlan(stranger, [{...taken, workoutName: "Übernommen"}])
        expect(hijack.status).toBe(409)
        expect(hijack.body.error).toBe("CONFLICT")

        const strangerPlan = await request(app).get("/plan").set(...auth(stranger.token)).expect(200)
        expect(strangerPlan.body.entries.map((e: {id: string}) => e.id)).toEqual([own.id])
        const ownerPlan = await request(app).get("/plan").set(...auth(owner.token)).expect(200)
        expect(ownerPlan.body.entries).toHaveLength(1)
        expect(ownerPlan.body.entries[0]).toMatchObject({id: taken.id, workoutName: "Meins"})
    })

    it("lässt einen Lese-Schlüssel lesen, aber nicht schreiben", async () => {
        const user = await registerUser(app)
        await savePlan(user, [entry(2, BUILT_IN_SWEET_SPOT, "Sweet Spot 3×12")]).then((r) => expect(r.status).toBe(200))

        const readKey = await request(app)
            .post("/me/keys")
            .set(...auth(user.token))
            .send({name: "Nur lesen", scope: "read"})
            .expect(201)
        const fullKey = await request(app)
            .post("/me/keys")
            .set(...auth(user.token))
            .send({name: "Assistent"})
            .expect(201)

        const read = await request(app).get("/plan").set(...auth(readKey.body.token)).expect(200)
        expect(read.body.entries).toHaveLength(1)

        await request(app).put("/plan").set(...auth(readKey.body.token)).send({entries: []}).expect(403)

        // Den Plan zu pflegen ist genau das, wofür ein Assistent da ist.
        await request(app).put("/plan").set(...auth(fullKey.body.token)).send({entries: []}).expect(200)
    })

    it("geht mit dem Konto", async () => {
        const user = await registerUser(app)
        const saved = await savePlan(user, [entry(1, BUILT_IN_SWEET_SPOT, "Sweet Spot 3×12")])
        expect(saved.status).toBe(200)

        await request(app).post("/me/delete").set(...auth(user.token)).send({password: "geheim12"}).expect(200)

        expect(await DBPlanEntry.count({where: {userID: user.userID}})).toBe(0)
    })
})
