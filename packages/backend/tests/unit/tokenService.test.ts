import type {DBUser} from "../../src/db/DBUser"
import {TokenService} from "../../src/service/TokenService"

const user = {id: 42} as DBUser

describe("Token", () => {
    const service = new TokenService("access-geheimnis", "refresh-geheimnis")

    it("traegt die Nutzerkennung hin und zurueck", () => {
        const token = service.generateAccessToken(user)
        expect(service.validateAccessToken(token)).toEqual({userID: 42})
    })

    it("haelt Zugangs- und Auffrischungstoken auseinander", () => {
        // Sonst waere ein 90 Tage gueltiges Auffrischungstoken auch ein
        // Zugangstoken, und die kurze Laufzeit des Zugangstokens waere umsonst.
        const access = service.generateAccessToken(user)
        const refresh = service.generateRefreshToken(user)

        expect(service.validateRefreshToken(access)).toBeUndefined()
        expect(service.validateAccessToken(refresh)).toBeUndefined()
        expect(service.validateRefreshToken(refresh)).toEqual({userID: 42})
    })

    it("weist Unsinn und fremde Geheimnisse ab", () => {
        const foreign = new TokenService("anderes-geheimnis", "anderes-refresh")
        expect(service.validateAccessToken("kein-token")).toBeUndefined()
        expect(service.validateAccessToken("")).toBeUndefined()
        expect(service.validateAccessToken(foreign.generateAccessToken(user))).toBeUndefined()
    })
})
