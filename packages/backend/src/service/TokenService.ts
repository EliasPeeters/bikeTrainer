import {NextFunction, Request as ExpressRequest, Response as ExpressResponse} from "express"
import jwt from "jsonwebtoken"
import {ACCESS_TOKEN_LIFETIME, REFRESH_TOKEN_LIFETIME} from "../config/env"
import {DBUser} from "../db/DBUser"
import {Server} from "../server"

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
            const authHeader = request.headers["authorization"]

            if (typeof authHeader === "string") {
                const parts = authHeader.split(" ")
                if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
                    const payload = this.validateAccessToken(parts[1])
                    if (payload !== undefined) {
                        response.locals.userID = payload.userID
                    }
                }
            }
            next()
        })
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
