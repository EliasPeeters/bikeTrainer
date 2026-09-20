import type {Express} from "express"
import request from "supertest"
import {auth, closeDatabase, registerUser, sampleSegments, setupTestServer, TestUser} from "./helpers"

let app: Express

beforeAll(async () => {
    app = await setupTestServer()
})

afterAll(async () => {
    await closeDatabase()
})

async function createWorkout(user: TestUser, name: string, visibility = "private"): Promise<string> {
    const response = await request(app)
        .post("/workouts")
        .set(...auth(user.token))
        .send({name, visibility, segments: sampleSegments()})
        .expect(201)
    return response.body.id
}

describe("Sammlungen", () => {
    it("legt eine Sammlung mit Inhalt in der gewünschten Reihenfolge an", async () => {
        const user = await registerUser(app)
        const first = await createWorkout(user, "Erstes")
        const second = await createWorkout(user, "Zweites")
        const third = await createWorkout(user, "Drittes")

        const response = await request(app)
            .post("/collections")
            .set(...auth(user.token))
            .send({name: "Aufbauwoche", summary: "Der Plan", workoutIDs: [third, first, second]})

        expect(response.status).toBe(201)
        expect(response.body.name).toBe("Aufbauwoche")
        expect(response.body.visibility).toBe("private")
        // Eine Playlist ohne Reihenfolge ist keine: "WHERE id IN (…)" liefert
        // die Zeilen in beliebiger Reihenfolge zurück.
        expect(response.body.workouts.map((w: {id: string}) => w.id)).toEqual([third, first, second])
    })

    it("nimmt Programme einzeln auf und wieder heraus", async () => {
        const user = await registerUser(app)
        const workoutID = await createWorkout(user, "Einzelnes")

        const created = await request(app)
            .post("/collections")
            .set(...auth(user.token))
            .send({name: "Leerer Ordner"})
            .expect(201)
        expect(created.body.workouts).toHaveLength(0)

        const added = await request(app)
            .post(`/collections/${created.body.id}/items`)
            .set(...auth(user.token))
            .send({workoutID})
        expect(added.status).toBe(200)
        expect(added.body.workouts).toHaveLength(1)

        // Zweimal hinzufügen legt keinen zweiten Eintrag an.
        const again = await request(app)
            .post(`/collections/${created.body.id}/items`)
            .set(...auth(user.token))
            .send({workoutID})
        expect(again.body.workouts).toHaveLength(1)

        const removed = await request(app)
            .delete(`/collections/${created.body.id}/items/${workoutID}`)
            .set(...auth(user.token))
        expect(removed.status).toBe(200)
        expect(removed.body.workouts).toHaveLength(0)
    })

    it("lässt keine fremden privaten Programme hinein", async () => {
        // Sonst wäre die Sammlung ein Weg, an fremde private Programme zu kommen.
        const owner = await registerUser(app)
        const stranger = await registerUser(app)
        const secret = await createWorkout(owner, "Geheim")

        const collection = await request(app)
            .post("/collections")
            .set(...auth(stranger.token))
            .send({name: "Fremde Sachen"})
            .expect(201)

        await request(app)
            .post(`/collections/${collection.body.id}/items`)
            .set(...auth(stranger.token))
            .send({workoutID: secret})
            .expect(404)
    })

    it("erlaubt fremde öffentliche Programme", async () => {
        const owner = await registerUser(app)
        const other = await registerUser(app)
        const shared = await createWorkout(owner, "Geteiltes", "public")

        const collection = await request(app)
            .post("/collections")
            .set(...auth(other.token))
            .send({name: "Gemerkt", workoutIDs: [shared]})
            .expect(201)

        expect(collection.body.workouts).toHaveLength(1)
        expect(collection.body.workouts[0].id).toBe(shared)
    })

    it("zeigt und löscht nur eigene Sammlungen", async () => {
        const user = await registerUser(app)
        const stranger = await registerUser(app)

        const created = await request(app)
            .post("/collections")
            .set(...auth(user.token))
            .send({name: "Meine"})
            .expect(201)

        const foreignList = await request(app).get("/collections").set(...auth(stranger.token))
        expect(foreignList.body.collections).toHaveLength(0)

        await request(app)
            .delete(`/collections/${created.body.id}`)
            .set(...auth(stranger.token))
            .expect(404)

        await request(app)
            .delete(`/collections/${created.body.id}`)
            .set(...auth(user.token))
            .expect(200)

        const ownList = await request(app).get("/collections").set(...auth(user.token))
        expect(ownList.body.collections).toHaveLength(0)
    })

    it("verlangt einen Namen", async () => {
        const user = await registerUser(app)
        await request(app)
            .post("/collections")
            .set(...auth(user.token))
            .send({name: "   "})
            .expect(400)
    })

    it("nimmt ein gelöschtes Programm aus der Sammlung mit", async () => {
        const user = await registerUser(app)
        const workoutID = await createWorkout(user, "Vergänglich")
        const collection = await request(app)
            .post("/collections")
            .set(...auth(user.token))
            .send({name: "Sammlung", workoutIDs: [workoutID]})
            .expect(201)

        await request(app)
            .delete(`/workouts/${workoutID}`)
            .set(...auth(user.token))
            .expect(200)

        const list = await request(app).get("/collections").set(...auth(user.token))
        const updated = list.body.collections.find((c: {id: string}) => c.id === collection.body.id)
        expect(updated.workouts).toHaveLength(0)
    })
})
