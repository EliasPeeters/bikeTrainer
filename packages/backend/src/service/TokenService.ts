import {NextFunction, Request as ExpressRequest, Response as ExpressResponse} from "express"
import jwt from "jsonwebtoken"
import {ACCESS_TOKEN_LIFETIME, REFRESH_TOKEN_LIFETIME} from "../config/env"
import {DBUser} from "../db/DBUser"
import {Server} from "../server"
import {isApiKey} from "./ApiKeyToken"

export interface JWTPayload {
    userID: number
}

export class TokenService {
    constructor(
        private readonly accessTokenSecret: string,
        private readonly refreshTokenSecret: string
    ) {}

    /**
     * Haengt sich vor alle Routen und legt die userID eines gueltigen Tokens in
     * `response.locals`. Die Middleware entscheidet nichts - ob eine Route
     * Anmeldung verlangt, steht in den Routen-Optionen. So funktionieren Routen,
     * die angemeldet und nicht angemeldet erreichbar sind, ohne Sonderfall.
     */
    public configure(server: Server) {
        server.app.use((request: ExpressRequest, response: ExpressResponse, next: NextFunction) => {
            // Der Zugangsschluessel muss nachgeschlagen werden, also ist die
            // Middleware asynchron. `next` laeuft in jedem Fall - ein
            // unbrauchbarer Header ist kein Fehler, sondern nur keine Identitaet.
            void this.identify(request, response).catch((error) => {
                console.error("[AUTH] Identifizierung fehlgeschlagen", error)
            }).finally(() => next())
        })
    }

    /**
     * Legt die Identitaet des Aufrufers in `response.locals` ab - aus einem
     * Zugangstoken oder aus einem Zugangsschluessel.
     *
     * Entschieden wird nichts: ob eine Route Anmeldung verlangt, steht in den
     * Routen-Optionen. So funktionieren Routen, die angemeldet und nicht
     * angemeldet erreichbar sind, ohne Sonderfall.
     */
    private async identify(request: ExpressRequest, response: ExpressResponse): Promise<void> {
        const authHeader = request.headers["authorization"]
        if (typeof authHeader !== "string") {
            return
        }
        const parts = authHeader.split(" ")
        if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
            return
        }
        const token = parts[1]

        if (isApiKey(token)) {
            // Erst hier geladen, nicht oben: ein Wert-Import von DBApiKey zoege
            // `db.ts` und damit eine Verbindung mit herein - auch in die
            // Unit-Tests, die keine Datenbank haben.
            const {resolveApiKey} = await import("./ApiKeyService")
            const resolved = await resolveApiKey(token)
            if (resolved !== null) {
                response.locals.userID = resolved.userID
                response.locals.apiKeyScope = resolved.scope
            }
            return
        }

        const payload = this.validateAccessToken(token)
        if (payload !== undefined) {
            response.locals.userID = payload.userID
        }
    }

    public generateAccessToken(user: DBUser): string {
        return jwt.sign({userID: user.id} satisfies JWTPayload, this.accessTokenSecret, {
            expiresIn: ACCESS_TOKEN_LIFETIME as jwt.SignOptions["expiresIn"],
        })
    }

    public generateRefreshToken(user: DBUser): string {
        return jwt.sign({userID: user.id} satisfies JWTPayload, this.refreshTokenSecret, {
            expiresIn: REFRESH_TOKEN_LIFETIME as jwt.SignOptions["expiresIn"],
        })
    }

    public validateAccessToken(token: string): JWTPayload | undefined {
        return this.validate(token, this.accessTokenSecret)
    }

    public validateRefreshToken(token: string): JWTPayload | undefined {
        return this.validate(token, this.refreshTokenSecret)
    }

    /**
     * Zugangs- und Auffrischungstoken haben verschiedene Geheimnisse. Sonst
     * liesse sich ein Auffrischungstoken - das 90 Tage gilt - direkt als
     * Zugangstoken verwenden, und die kurze Laufzeit waere wirkungslos.
     */
    private validate(token: string, secret: string): JWTPayload | undefined {
        try {
            const payload = jwt.verify(token, secret)
            if (typeof payload === "object" && payload !== null && typeof payload.userID === "number") {
                return {userID: payload.userID}
            }
            return undefined
        } catch {
            return undefined
        }
    }
}
