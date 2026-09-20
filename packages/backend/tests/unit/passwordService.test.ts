import {PasswordService} from "../../src/service/PasswordService"

describe("Passwoerter", () => {
    // Weniger Runden als in Produktion, sonst dauert der Test unnoetig lange.
    const service = new PasswordService(4)

    it("prueft den eigenen Hash", async () => {
        const hash = await service.hashPassword("geheim12")
        expect(hash).not.toContain("geheim12")
        expect(await service.checkPassword("geheim12", hash)).toBe(true)
        expect(await service.checkPassword("geheim13", hash)).toBe(false)
    })

    it("erzeugt fuer dasselbe Passwort verschiedene Hashes", async () => {
        // Der Zufallswert im Hash sorgt dafuer, dass zwei Nutzer mit demselben
        // Passwort in der Datenbank nicht gleich aussehen.
        const a = await service.hashPassword("geheim12")
        const b = await service.hashPassword("geheim12")
        expect(a).not.toBe(b)
    })
})
