import request from "supertest"
import {Server} from "../../src/server"
import {AuthService} from "../../src/service/AuthService"
import {PasswordService} from "../../src/service/PasswordService"
import {TokenService} from "../../src/service/TokenService"
import {closeDatabase, uniqueEmail} from "./helpers"
import {waitForDatabase} from "../../src/db/db"

/**
 * Eigener Server mit engem Kontingent - die uebrigen Integrationstests laufen
 * bewusst mit hohen Grenzen, sonst wuerde jeder zweite Test die Bremse treffen
 * statt das, was er pruefen soll.
 */
function serverWithLimit(registerLimit: number) {
    const server = new Server()
    const tokenService = new TokenService("access", "refresh")
    tokenService.configure(server)
    new AuthService(tokenService, new PasswordService(4), {
        registerLimit,
        registerWindowMs: 60_000,
        loginLimit: registerLimit,
        loginWindowMs: 60_000,
    }).configure(server)
    server.finalize()
    return server.app
}

beforeAll(async () => {
    await waitForDatabase(5, 1000)
})

afterAll(async () => {
    await closeDatabase()
})

describe("Ratenbegrenzung der Anmelderouten", () => {
    it("laesst das Kontingent durch und bremst danach", async () => {
        const app = serverWithLimit(2)

        await request(app).post("/auth/register").send({email: uniqueEmail(), password: "geheim12"}).expect(201)
        await request(app).post("/auth/register").send({email: uniqueEmail(), password: "geheim12"}).expect(201)

        const blocked = await request(app)
            .post("/auth/register")
            .send({email: uniqueEmail(), password: "geheim12"})

        expect(blocked.status).toBe(429)
        expect(blocked.body.error).toBe("TOO_MANY_REQUESTS")
    })

    it("zaehlt die weitergereichte Adresse, nicht die des Proxys", async () => {
        // Hinter nginx haben alle Anfragen dieselbe Socket-Adresse. Ohne
        // Auswertung von X-Forwarded-For teilten sich alle Nutzer ein Kontingent.
        const app = serverWithLimit(1)

        await request(app)
            .post("/auth/register")
            .set("X-Forwarded-For", "203.0.113.10")
            .send({email: uniqueEmail(), password: "geheim12"})
            .expect(201)

        await request(app)
            .post("/auth/register")
            .set("X-Forwarded-For", "203.0.113.10")
            .send({email: uniqueEmail(), password: "geheim12"})
            .expect(429)

        // Andere Herkunft, eigenes Kontingent.
        await request(app)
            .post("/auth/register")
            .set("X-Forwarded-For", "203.0.113.11")
            .send({email: uniqueEmail(), password: "geheim12"})
            .expect(201)
    })
})
