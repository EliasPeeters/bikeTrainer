import type {Express} from "express"
import request from "supertest"
import {DBUser} from "../../src/db/DBUser"
import {closeDatabase, setupTestServer, uniqueEmail} from "./helpers"

let app: Express

beforeAll(async () => {
    app = await setupTestServer()
})

afterAll(async () => {
    await closeDatabase()
})

describe("POST /auth/register", () => {
    it("legt ein Konto an und liefert Tokens", async () => {
        const email = uniqueEmail()
        const response = await request(app)
            .post("/auth/register")
            .send({email, password: "geheim12", name: "Elias"})

        expect(response.status).toBe(201)
        expect(response.body.user.email).toBe(email)
        expect(response.body.user.name).toBe("Elias")
        // Die Standardwerte des Fahrerprofils kommen aus dem Schema.
        expect(response.body.user.ftp).toBe(200)
        expect(typeof response.body.accessToken).toBe("string")
        expect(typeof response.body.refreshToken).toBe("string")

        // Der Passwort-Hash darf die Antwort unter keinen Umstaenden verlassen.
        expect(JSON.stringify(response.body)).not.toContain("passwordHash")
        expect(JSON.stringify(response.body)).not.toContain("geheim12")
    })

    it("speichert die Adresse normalisiert", async () => {
        const email = uniqueEmail()
        await request(app)
            .post("/auth/register")
            .send({email: `  ${email.toUpperCase()} `, password: "geheim12"})
            .expect(201)

        const user = await DBUser.findOne({where: {email}})
        expect(user).not.toBeNull()
    })

    it("nimmt dieselbe Adresse kein zweites Mal", async () => {
        const email = uniqueEmail()
        await request(app).post("/auth/register").send({email, password: "geheim12"}).expect(201)

        // Auch in anderer Schreibweise nicht - sonst gaebe es zwei Konten,
        // zwischen denen niemand unterscheiden kann.
        const response = await request(app)
            .post("/auth/register")
            .send({email: email.toUpperCase(), password: "geheim12"})

        expect(response.status).toBe(409)
        expect(response.body.error).toBe("EMAIL_TAKEN")
    })

    it("lehnt unbrauchbare Eingaben mit einem Code ab", async () => {
        const badEmail = await request(app)
            .post("/auth/register")
            .send({email: "keine-adresse", password: "geheim12"})
        expect(badEmail.status).toBe(400)
        expect(badEmail.body.error).toBe("INVALID_EMAIL")

        const weak = await request(app)
            .post("/auth/register")
            .send({email: uniqueEmail(), password: "kurz"})
        expect(weak.status).toBe(400)
        expect(weak.body.error).toBe("WEAK_PASSWORD")

        const empty = await request(app).post("/auth/register").send({})
        expect(empty.status).toBe(400)
    })

    it("legt bei abgelehnter Eingabe nichts an", async () => {
        const email = uniqueEmail()
        await request(app).post("/auth/register").send({email, password: "kurz"}).expect(400)
        expect(await DBUser.findOne({where: {email}})).toBeNull()
    })
})

describe("POST /auth/login", () => {
    it("meldet mit den richtigen Daten an", async () => {
        const email = uniqueEmail()
        await request(app).post("/auth/register").send({email, password: "geheim12"}).expect(201)

        const response = await request(app).post("/auth/login").send({email, password: "geheim12"})
        expect(response.status).toBe(200)
        expect(response.body.user.email).toBe(email)
        expect(typeof response.body.accessToken).toBe("string")
    })

    it("antwortet bei falschem Passwort und unbekannter Adresse gleich", async () => {
        // Unterschiedliche Antworten machten die Anmeldemaske zu einem
        // Verzeichnis registrierter Adressen.
        const email = uniqueEmail()
        await request(app).post("/auth/register").send({email, password: "geheim12"}).expect(201)

        const wrongPassword = await request(app).post("/auth/login").send({email, password: "falsch123"})
        const unknownUser = await request(app)
            .post("/auth/login")
            .send({email: uniqueEmail(), password: "geheim12"})

        expect(wrongPassword.status).toBe(401)
        expect(unknownUser.status).toBe(401)
        expect(wrongPassword.body).toEqual(unknownUser.body)
        expect(wrongPassword.body.error).toBe("INVALID_CREDENTIALS")
    })
})

describe("POST /auth/refresh", () => {
    it("tauscht ein Auffrischungstoken gegen neue Tokens", async () => {
        const email = uniqueEmail()
        const registered = await request(app)
            .post("/auth/register")
            .send({email, password: "geheim12"})
            .expect(201)

        const response = await request(app)
            .post("/auth/refresh")
            .send({refreshToken: registered.body.refreshToken})

        expect(response.status).toBe(200)
        expect(typeof response.body.accessToken).toBe("string")
    })

    it("nimmt kein Zugangstoken als Auffrischungstoken", async () => {
        const registered = await request(app)
            .post("/auth/register")
            .send({email: uniqueEmail(), password: "geheim12"})
            .expect(201)

        const response = await request(app)
            .post("/auth/refresh")
            .send({refreshToken: registered.body.accessToken})

        expect(response.status).toBe(401)
        expect(response.body.error).toBe("INVALID_TOKEN")
    })
})

describe("Angemeldete Routen", () => {
    it("verlangen ein gueltiges Token", async () => {
        const withoutToken = await request(app).get("/me")
        expect(withoutToken.status).toBe(401)
        expect(withoutToken.body.error).toBe("UNAUTHORIZED")

        const brokenToken = await request(app).get("/me").set("Authorization", "Bearer unsinn")
        expect(brokenToken.status).toBe(401)
    })

    it("liefern und aendern das Fahrerprofil", async () => {
        const registered = await request(app)
            .post("/auth/register")
            .send({email: uniqueEmail(), password: "geheim12", name: "Elias"})
            .expect(201)
        const token = registered.body.accessToken

        const profile = await request(app).get("/me").set("Authorization", `Bearer ${token}`)
        expect(profile.status).toBe(200)
        expect(profile.body.name).toBe("Elias")

        const updated = await request(app)
            .put("/me")
            .set("Authorization", `Bearer ${token}`)
            .send({ftp: 265, weightKg: 72.5})
        expect(updated.status).toBe(200)
        expect(updated.body.ftp).toBe(265)
        expect(updated.body.weightKg).toBe(72.5)
        // Nicht mitgeschickte Felder bleiben stehen.
        expect(updated.body.name).toBe("Elias")

        const unrealistic = await request(app)
            .put("/me")
            .set("Authorization", `Bearer ${token}`)
            .send({ftp: 30000})
        expect(unrealistic.status).toBe(400)
    })
})

describe("Sonstiges", () => {
    it("meldet Gesundheit samt Datenbank", async () => {
        const response = await request(app).get("/health")
        expect(response.status).toBe(200)
        expect(response.body.status).toBe("ok")
        expect(response.body.database).toBe("up")
    })

    it("antwortet auf unbekannte Routen mit einem Code", async () => {
        const response = await request(app).get("/gibtesnicht")
        expect(response.status).toBe(404)
        expect(response.body.error).toBe("NOT_FOUND")
    })
})
