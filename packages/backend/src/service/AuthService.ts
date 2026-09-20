import {
    AuthResponse,
    LoginRequest,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
} from "@wattwerk/shared"
import {UniqueConstraintError} from "sequelize"
import {
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
    REGISTER_RATE_LIMIT,
    REGISTER_RATE_WINDOW_MS,
} from "../config/env"
import {DBUser, normalizeEmail, userByEmail} from "../db/DBUser"
import {failure, Response, Server} from "../server"
import {PasswordService} from "./PasswordService"
import {RateLimiter} from "./RateLimiter"
import {TokenService} from "./TokenService"
import {isNonEmptyString, isValidEmail, passwordIssue, sanitizeName} from "./Validation"

/**
 * Ein Hash, gegen den geprueft wird, wenn es den Nutzer gar nicht gibt.
 *
 * Ohne ihn antwortet die Anmeldung bei unbekannter Adresse sofort und bei
 * bekannter erst nach dem bcrypt-Vergleich. Der Unterschied ist messbar und
 * verraet damit, welche Adressen registriert sind.
 */
const DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

export interface AuthServiceLimits {
    registerLimit?: number
    registerWindowMs?: number
    loginLimit?: number
    loginWindowMs?: number
}

export class AuthService {
    /** Wenige Versuche je IP reichen fuer Vertipper, nicht fuer Listen. */
    private readonly loginLimiter: RateLimiter
    private readonly registerLimiter: RateLimiter

    constructor(
        private readonly tokenService: TokenService,
        private readonly passwordService: PasswordService,
        limits: AuthServiceLimits = {}
    ) {
        this.loginLimiter = new RateLimiter(
            limits.loginLimit ?? LOGIN_RATE_LIMIT,
            limits.loginWindowMs ?? LOGIN_RATE_WINDOW_MS
        )
        this.registerLimiter = new RateLimiter(
            limits.registerLimit ?? REGISTER_RATE_LIMIT,
            limits.registerWindowMs ?? REGISTER_RATE_WINDOW_MS
        )

        // Aufraeumen, damit die Zaehler-Maps nicht mit jeder je gesehenen IP wachsen.
        const timer = setInterval(() => {
            this.loginLimiter.cleanup()
            this.registerLimiter.cleanup()
        }, 60_000)
        timer.unref()
    }

    public configure(server: Server) {
        server.route("/auth/register", {authenticated: false}).postJSON<RegisterRequest, AuthResponse>(
            async (request) => {
                if (!this.registerLimiter.check(request.ip)) {
                    return failure(429, "TOO_MANY_REQUESTS", "Zu viele Registrierungen. Bitte später erneut versuchen.")
                }

                const body = request.body
                if (body === null || typeof body !== "object") {
                    return failure(400, "INVALID_BODY", "Der Anfragekoerper fehlt.")
                }
                if (!isNonEmptyString(body.email) || !isValidEmail(body.email)) {
                    return failure(400, "INVALID_EMAIL", "Diese E-Mail-Adresse sieht nicht richtig aus.")
                }
                const issue = passwordIssue(body.password)
                if (issue !== null) {
                    return failure(400, "WEAK_PASSWORD", issue)
                }

                const email = normalizeEmail(body.email)
                if ((await userByEmail(email)) !== null) {
                    return failure(409, "EMAIL_TAKEN", "Für diese Adresse gibt es schon ein Konto.")
                }

                const passwordHash = await this.passwordService.hashPassword(body.password)

                let user: DBUser
                try {
                    user = await DBUser.create({
                        email,
                        passwordHash,
                        name: sanitizeName(body.name),
                        mailContactAllowed: body.mailContactAllowed === true,
                    })
                } catch (error) {
                    // Zwei gleichzeitige Registrierungen mit derselben Adresse:
                    // die Pruefung oben sieht beide Male nichts, der eindeutige
                    // Index faengt die zweite ab.
                    if (error instanceof UniqueConstraintError) {
                        return failure(409, "EMAIL_TAKEN", "Für diese Adresse gibt es schon ein Konto.")
                    }
                    throw error
                }

                return Response.json(201, this.authResponse(user))
            }
        )

        server.route("/auth/login", {authenticated: false}).postJSON<LoginRequest, AuthResponse>(async (request) => {
            if (!this.loginLimiter.check(request.ip)) {
                return failure(429, "TOO_MANY_REQUESTS", "Zu viele Anmeldeversuche. Bitte kurz warten.")
            }

            const body = request.body
            if (body === null || typeof body !== "object" || !isNonEmptyString(body.email)) {
                return failure(400, "INVALID_BODY", "E-Mail und Passwort werden benoetigt.")
            }

            const user = await userByEmail(body.email)
            const password = typeof body.password === "string" ? body.password : ""
            const matches = await this.passwordService.checkPassword(
                password,
                user?.passwordHash ?? DUMMY_PASSWORD_HASH
            )

            // Dieselbe Antwort fuer "Adresse unbekannt" und "Passwort falsch":
            // sonst wird die Anmeldemaske zum Verzeichnis registrierter Adressen.
            if (user === null || !matches) {
                return failure(401, "INVALID_CREDENTIALS", "E-Mail oder Passwort stimmt nicht.")
            }

            await user.update({lastLoginAt: new Date()})
            return Response.json(200, this.authResponse(user))
        })

        server.route("/auth/refresh", {authenticated: false}).postJSON<RefreshTokenRequest, RefreshTokenResponse>(
            async (request) => {
                const token = request.body?.refreshToken
                if (!isNonEmptyString(token)) {
                    return failure(400, "INVALID_BODY", "refreshToken fehlt.")
                }

                const payload = this.tokenService.validateRefreshToken(token)
                if (payload === undefined) {
                    return failure(401, "INVALID_TOKEN", "Das Token ist abgelaufen oder ungültig.")
                }

                const user = await DBUser.findByPk(payload.userID)
                if (user === null) {
                    return failure(401, "INVALID_TOKEN", "Das Token ist abgelaufen oder ungültig.")
                }

                return Response.json(200, {
                    accessToken: this.tokenService.generateAccessToken(user),
                    refreshToken: this.tokenService.generateRefreshToken(user),
                })
            }
        )

    }

    private authResponse(user: DBUser): AuthResponse {
        return {
            user: user.toResponse(),
            accessToken: this.tokenService.generateAccessToken(user),
            refreshToken: this.tokenService.generateRefreshToken(user),
        }
    }
}
