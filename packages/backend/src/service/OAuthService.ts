import type {ConnectionListResponse, ConnectionResponse} from "@wattwerk/shared"
import {createHash, randomBytes, randomUUID} from "node:crypto"
import jwt from "jsonwebtoken"
import {
    ACCESS_TOKEN_LIFETIME,
    ACCESS_TOKEN_SECRET,
    BASE_URL,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
    MCP_RESOURCE_URL,
    OAUTH_REFRESH_LIFETIME_DAYS,
} from "../config/env"
import {DBOAuthClient, DBOAuthCode, DBOAuthGrant} from "../db/DBOAuth"
import {userByEmail} from "../db/DBUser"
import {failure, Response, Server} from "../server"
import {consentPage, errorPage} from "./OAuthConsentPage"
import {OAuthClient, resolveClient} from "./OAuthClients"
import {PasswordService} from "./PasswordService"
import {RateLimiter} from "./RateLimiter"

const SCOPE_READ = "wattwerk:read"
const SCOPE_WRITE = "wattwerk:write"
const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE]

const CODE_LIFETIME_MS = 60 * 1000
const REFRESH_TOKEN_PREFIX = "wro_"
const MAX_REGISTERED_CLIENTS = 500

/**
 * Die API als OAuth-2.1-Autorisierungsserver.
 *
 * Gebraucht wird er fuer ChatGPT und die Connectors auf claude.ai: dort gibt es
 * kein Feld fuer einen Zugangsschluessel, sondern nur "Verbinden" - und
 * dahinter muss OAuth liegen. Der MCP-Server ist dabei der Resource Server,
 * diese API der Autorisierungsserver. Die Nutzer liegen ohnehin hier; ein
 * zweiter Ort fuer Identitaeten waere die schlechtere Antwort.
 *
 * Umgesetzt ist die Teilmenge, die die MCP-Spezifikation verlangt:
 * Authorization Code mit PKCE (nur S256), Client ID Metadata Documents,
 * Dynamic Client Registration als Rueckfallebene, und Tokens, die an den
 * Empfaenger gebunden sind (RFC 8707).
 */
export class OAuthService {
    private readonly consentLimiter = new RateLimiter(LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS)
    private readonly registerLimiter = new RateLimiter(20, 60 * 60 * 1000)

    constructor(private readonly passwordService: PasswordService) {
        const timer = setInterval(() => {
            this.consentLimiter.cleanup()
            this.registerLimiter.cleanup()
        }, 60_000)
        timer.unref()
    }

    public configure(server: Server) {
        // MARK: - Auffindbarkeit

        server
            .route("/.well-known/oauth-authorization-server", {
                authenticated: false,
                databaseTransaction: false,
            })
            .get<Record<string, unknown>>(async () => Response.json(200, this.metadata()))

        // Manche Clients haengen den Pfad der Ressource an. Dieselbe Antwort.
        server
            .route("/.well-known/oauth-authorization-server/*", {
                authenticated: false,
                databaseTransaction: false,
            })
            .get<Record<string, unknown>>(async () => Response.json(200, this.metadata()))

        // MARK: - Zustimmung

        server.route("/oauth/authorize", {authenticated: false}).get<string>(async (request) => {
            const parsed = await this.readAuthorizationRequest(request.query)
            if ("fatal" in parsed) {
                // Ohne geprueften redirect_uri wird nicht weitergeleitet - sonst
                // waere die Fehlerseite selbst der offene Umleiter.
                return Response.raw(400, errorPage("Das geht so nicht", parsed.fatal), "text/html; charset=utf-8")
            }
            if ("redirectError" in parsed) {
                return Response.redirect(parsed.redirectError)
            }

            return Response.raw(
                200,
                consentPage({
                    clientName: parsed.client.clientName,
                    scope: parsed.scope,
                    hidden: parsed.hidden,
                }),
                "text/html; charset=utf-8"
            )
        })

        server
            .route("/oauth/authorize", {authenticated: false})
            .postForm<Record<string, string>, string>(async (request) => {
                const body = request.body ?? {}
                const parsed = await this.readAuthorizationRequest(body)
                if ("fatal" in parsed) {
                    return Response.raw(400, errorPage("Das geht so nicht", parsed.fatal), "text/html; charset=utf-8")
                }
                if ("redirectError" in parsed) {
                    return Response.redirect(parsed.redirectError)
                }

                if (body.decision !== "allow") {
                    return Response.redirect(
                        this.redirectWith(parsed.redirectUri, {
                            error: "access_denied",
                            error_description: "Der Nutzer hat abgelehnt.",
                            state: parsed.state,
                        })
                    )
                }

                const page = (error: string) =>
                    Response.raw(
                        401,
                        consentPage({
                            clientName: parsed.client.clientName,
                            scope: parsed.scope,
                            hidden: parsed.hidden,
                            email: typeof body.email === "string" ? body.email : undefined,
                            error,
                        }),
                        "text/html; charset=utf-8"
                    )

                if (!this.consentLimiter.check(request.ip)) {
                    return page("Zu viele Versuche. Bitte später erneut.")
                }

                const email = typeof body.email === "string" ? body.email : ""
                const password = typeof body.password === "string" ? body.password : ""
                const user = await userByEmail(email)
                const matches =
                    user !== null && (await this.passwordService.checkPassword(password, user.passwordHash))
                if (user === null || !matches) {
                    return page("E-Mail oder Passwort stimmt nicht.")
                }

                const code = `${randomBytes(32).toString("base64url")}`
                await DBOAuthCode.create({
                    codeHash: sha256(code),
                    clientID: parsed.client.clientID,
                    userID: user.id,
                    redirectUri: parsed.redirectUri,
                    codeChallenge: parsed.codeChallenge,
                    resource: parsed.resource,
                    scope: parsed.scope,
                    expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
                })

                return Response.redirect(
                    this.redirectWith(parsed.redirectUri, {
                        code,
                        state: parsed.state,
                        // RFC 9207: der Client prueft damit, dass die Antwort von
                        // dem Server kommt, den er gefragt hat.
                        iss: BASE_URL,
                    })
                )
            })

        // MARK: - Tokens

        server
            .route("/oauth/token", {authenticated: false})
            .postForm<Record<string, string>, Record<string, unknown>>(async (request) => {
                const body = request.body ?? {}
                switch (body.grant_type) {
                    case "authorization_code":
                        return await this.exchangeCode(body)
                    case "refresh_token":
                        return await this.refresh(body)
                    default:
                        return oauthError(400, "unsupported_grant_type", "Nur authorization_code und refresh_token.")
                }
            })

        // MARK: - Registrierung

        server
            .route("/oauth/register", {authenticated: false})
            .postForm<Record<string, unknown>, Record<string, unknown>>(async (request) => {
                if (!this.registerLimiter.check(request.ip)) {
                    return oauthError(429, "invalid_request", "Zu viele Registrierungen.")
                }

                const body = request.body ?? {}
                const redirectUris = Array.isArray(body.redirect_uris)
                    ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string")
                    : []
                if (redirectUris.length === 0) {
                    return oauthError(400, "invalid_redirect_uri", "redirect_uris fehlt.")
                }
                for (const uri of redirectUris) {
                    if (!isAcceptableRedirectUri(uri)) {
                        return oauthError(
                            400,
                            "invalid_redirect_uri",
                            `${uri} ist nicht erlaubt: nur https, oder http auf localhost.`
                        )
                    }
                }

                // Die Tabelle ist sonst ein Eimer, in den jeder schuetten kann.
                if ((await DBOAuthClient.count()) >= MAX_REGISTERED_CLIENTS) {
                    return oauthError(
                        400,
                        "invalid_request",
                        "Es sind zu viele Clients registriert. Benutze eine HTTPS-URL als client_id."
                    )
                }

                const clientID = `wc_${randomUUID()}`
                const clientName =
                    typeof body.client_name === "string" && body.client_name.trim().length > 0
                        ? body.client_name.trim().slice(0, 200)
                        : "Unbenannte Anwendung"

                await DBOAuthClient.create({clientID, clientName, redirectUris})

                return Response.json(201, {
                    client_id: clientID,
                    client_id_issued_at: Math.floor(Date.now() / 1000),
                    client_name: clientName,
                    redirect_uris: redirectUris,
                    grant_types: ["authorization_code", "refresh_token"],
                    response_types: ["code"],
                    // Oeffentlicher Client: es gibt kein Geheimnis, das eine
                    // Anwendung auf einem fremden Geraet schuetzen koennte.
                    token_endpoint_auth_method: "none",
                })
            })

        // MARK: - Verbundene Anwendungen im Portal

        server
            .route("/me/connections", {authenticated: true, includeUser: true, allowDelegated: false})
            .get<ConnectionListResponse>(async (request) => {
                const grants = await DBOAuthGrant.findAll({
                    where: {userID: request.user.id},
                    order: [["createdAt", "DESC"]],
                })
                return Response.json(200, {connections: grants.map(toConnectionResponse)})
            })

        server
            .route("/me/connections/:id", {authenticated: true, includeUser: true, allowDelegated: false})
            .delete<{deleted: boolean}>(async (request) => {
                const id = parseInt(request.parameter.id, 10)
                if (!Number.isFinite(id)) {
                    return failure(400, "INVALID_BODY", "Ungültige Kennung.")
                }
                const removed = await DBOAuthGrant.destroy({where: {id, userID: request.user.id}})
                if (removed === 0) {
                    return failure(404, "NOT_FOUND", "Diese Verbindung gibt es nicht.")
                }
                return Response.json(200, {deleted: true})
            })
    }

    // MARK: - Metadaten

    private metadata(): Record<string, unknown> {
        return {
            issuer: BASE_URL,
            authorization_endpoint: `${BASE_URL}/oauth/authorize`,
            token_endpoint: `${BASE_URL}/oauth/token`,
            registration_endpoint: `${BASE_URL}/oauth/register`,
            scopes_supported: SUPPORTED_SCOPES,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            // Nur S256: `plain` waere PKCE, das nichts schuetzt.
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            client_id_metadata_document_supported: true,
            authorization_response_iss_parameter_supported: true,
            service_documentation: "https://github.com/EliasPeeters/bikeTrainer/blob/main/docs/MCP.md",
        }
    }

    // MARK: - Anfrage lesen und pruefen

    /**
     * Prueft eine Autorisierungsanfrage.
     *
     * Drei Ausgaenge, und die Unterscheidung ist der Kern: `fatal` heisst, dass
     * Client oder redirect_uri nicht stimmen - dann darf *nicht* weitergeleitet
     * werden, weil die Adresse selbst nicht vertrauenswuerdig ist.
     * `redirectError` heisst, der Client stimmt, die Anfrage nicht - dann gehoert
     * der Fehler zurueck an den Client.
     */
    private async readAuthorizationRequest(
        source: Record<string, unknown>
    ): Promise<
        | {fatal: string}
        | {redirectError: string}
        | {
              client: OAuthClient
              redirectUri: string
              scope: string
              state?: string
              codeChallenge: string
              resource: string
              hidden: Record<string, string>
          }
    > {
        const text = (key: string): string | undefined => {
            const value = source[key]
            return typeof value === "string" && value.length > 0 ? value : undefined
        }

        const clientID = text("client_id")
        const redirectUri = text("redirect_uri")
        if (clientID === undefined) {
            return {fatal: "Es fehlt die client_id."}
        }
        if (redirectUri === undefined) {
            return {fatal: "Es fehlt die redirect_uri."}
        }

        const client = await resolveClient(clientID)
        if (client === null) {
            return {
                fatal:
                    "Diese Anwendung ist unbekannt. Entweder ist ihre client_id falsch, oder ihr " +
                    "Metadatendokument ist nicht erreichbar.",
            }
        }
        // Genauer Vergleich: ein Praefixvergleich waere der Weg, den Code an
        // eine fremde Adresse unter derselben Domain zu schicken.
        if (!client.redirectUris.includes(redirectUri)) {
            return {fatal: "Diese Weiterleitungsadresse gehört nicht zu dieser Anwendung."}
        }

        const state = text("state")
        const fail = (error: string, description: string) => ({
            redirectError: this.redirectWith(redirectUri, {error, error_description: description, state}),
        })

        if (text("response_type") !== "code") {
            return fail("unsupported_response_type", "Nur response_type=code.")
        }
        if (text("code_challenge_method") !== "S256") {
            return fail("invalid_request", "PKCE ist Pflicht, und zwar mit code_challenge_method=S256.")
        }
        const codeChallenge = text("code_challenge")
        if (codeChallenge === undefined || codeChallenge.length < 43 || codeChallenge.length > 128) {
            return fail("invalid_request", "code_challenge fehlt oder ist unbrauchbar.")
        }

        // Ohne Empfaengerbindung liesse sich das Token anderswo einsetzen.
        const resource = text("resource") ?? MCP_RESOURCE_URL
        if (!sameResource(resource, MCP_RESOURCE_URL)) {
            return fail("invalid_target", `Für diesen Empfänger werden hier keine Tokens ausgestellt: ${resource}`)
        }

        const requested = (text("scope") ?? SCOPE_READ).split(" ").filter((entry) => entry.length > 0)
        const unknown = requested.filter((entry) => !SUPPORTED_SCOPES.includes(entry))
        if (unknown.length > 0) {
            return fail("invalid_scope", `Unbekannter Bereich: ${unknown.join(", ")}`)
        }
        // Lesen ist immer dabei - ein Schreibrecht ohne Leserecht waere sinnlos.
        const scope = requested.includes(SCOPE_WRITE) ? `${SCOPE_READ} ${SCOPE_WRITE}` : SCOPE_READ

        const hidden: Record<string, string> = {
            client_id: clientID,
            redirect_uri: redirectUri,
            response_type: "code",
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            scope,
            resource,
        }
        if (state !== undefined) {
            hidden.state = state
        }

        return {client, redirectUri, scope, state, codeChallenge, resource, hidden}
    }

    // MARK: - Code einloesen

    private async exchangeCode(body: Record<string, string>): Promise<Response<Record<string, unknown>>> {
        const code = body.code
        const verifier = body.code_verifier
        const clientID = body.client_id
        if (typeof code !== "string" || typeof verifier !== "string" || typeof clientID !== "string") {
            return oauthError(400, "invalid_request", "code, code_verifier und client_id werden gebraucht.")
        }

        const stored = await DBOAuthCode.findOne({where: {codeHash: sha256(code)}})
        if (stored === null) {
            return oauthError(400, "invalid_grant", "Diesen Code gibt es nicht.")
        }

        // Ein zweites Einloesen heisst, dass der Code unterwegs mitgelesen
        // wurde. Dann faellt auch alles, was aus ihm entstanden ist.
        if (stored.usedAt !== null && stored.usedAt !== undefined) {
            await DBOAuthGrant.destroy({where: {userID: stored.userID, clientID: stored.clientID}})
            return oauthError(400, "invalid_grant", "Dieser Code wurde schon benutzt.")
        }
        if (stored.isExpired()) {
            return oauthError(400, "invalid_grant", "Dieser Code ist abgelaufen.")
        }
        if (stored.clientID !== clientID) {
            return oauthError(400, "invalid_grant", "Dieser Code gehört zu einer anderen Anwendung.")
        }
        if (typeof body.redirect_uri === "string" && body.redirect_uri !== stored.redirectUri) {
            return oauthError(400, "invalid_grant", "redirect_uri passt nicht zur Anfrage.")
        }
        if (sha256Base64Url(verifier) !== stored.codeChallenge) {
            return oauthError(400, "invalid_grant", "code_verifier passt nicht zur code_challenge.")
        }

        await stored.update({usedAt: new Date()})

        const client = await resolveClient(clientID)
        return await this.issueTokens({
            userID: stored.userID,
            clientID: stored.clientID,
            clientName: client?.clientName ?? stored.clientID,
            scope: stored.scope,
            resource: stored.resource,
        })
    }

    private async refresh(body: Record<string, string>): Promise<Response<Record<string, unknown>>> {
        const token = body.refresh_token
        if (typeof token !== "string") {
            return oauthError(400, "invalid_request", "refresh_token fehlt.")
        }

        const grant = await DBOAuthGrant.findOne({where: {refreshTokenHash: sha256(token)}})
        if (grant === null || grant.isExpired()) {
            return oauthError(400, "invalid_grant", "Dieses Auffrischungstoken gilt nicht mehr.")
        }
        if (typeof body.client_id === "string" && body.client_id !== grant.clientID) {
            return oauthError(400, "invalid_grant", "Dieses Token gehört zu einer anderen Anwendung.")
        }

        // Das alte Token faellt weg. Taucht es danach noch einmal auf, ist es
        // abgegriffen - und die Verbindung ist dann ohnehin schon geschlossen.
        await grant.destroy()

        return await this.issueTokens({
            userID: grant.userID,
            clientID: grant.clientID,
            clientName: grant.clientName,
            scope: grant.scope,
            resource: grant.resource,
        })
    }

    private async issueTokens(input: {
        userID: number
        clientID: string
        clientName: string
        scope: string
        resource: string
    }): Promise<Response<Record<string, unknown>>> {
        const refreshToken = `${REFRESH_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
        const expiresAt = new Date(Date.now() + OAUTH_REFRESH_LIFETIME_DAYS * 24 * 3600 * 1000)

        await DBOAuthGrant.create({
            userID: input.userID,
            clientID: input.clientID,
            clientName: input.clientName,
            refreshTokenHash: sha256(refreshToken),
            scope: input.scope,
            resource: input.resource,
            expiresAt,
            lastUsedAt: new Date(),
        })

        const accessToken = jwt.sign(
            {userID: input.userID, scope: input.scope, client_id: input.clientID},
            ACCESS_TOKEN_SECRET,
            {
                expiresIn: ACCESS_TOKEN_LIFETIME as jwt.SignOptions["expiresIn"],
                issuer: BASE_URL,
                // Die Empfaengerbindung. Der MCP-Server lehnt alles ab, was
                // nicht fuer ihn ausgestellt wurde.
                audience: input.resource,
                subject: String(input.userID),
            }
        )

        return Response.json(
            200,
            {
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: 15 * 60,
                refresh_token: refreshToken,
                scope: input.scope,
            },
            // Tokens gehoeren in keinen Zwischenspeicher.
            {"Cache-Control": "no-store", Pragma: "no-cache"}
        )
    }

    private redirectWith(redirectUri: string, params: Record<string, string | undefined>): string {
        const url = new URL(redirectUri)
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                url.searchParams.set(key, value)
            }
        }
        return url.toString()
    }
}

// MARK: - Antworten im Portal

function toConnectionResponse(grant: DBOAuthGrant): ConnectionResponse {
    return {
        id: grant.id,
        clientName: grant.clientName,
        clientID: grant.clientID,
        scope: grant.scope,
        lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        createdAt: grant.createdAt.toISOString(),
    }
}

// MARK: - Kleinkram

function sha256(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
}

function sha256Base64Url(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("base64url")
}

/**
 * Vergleich zweier Empfaengeradressen.
 *
 * Ein abschliessender Schraegstrich macht keinen anderen Dienst daraus, und
 * Gross- und Kleinschreibung in Schema und Host auch nicht.
 */
function sameResource(left: string, right: string): boolean {
    const normalize = (value: string) => {
        try {
            const url = new URL(value)
            return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`.toLowerCase()
        } catch {
            return value.toLowerCase()
        }
    }
    return normalize(left) === normalize(right)
}

/**
 * Wohin ein Client nach der Zustimmung geschickt werden darf.
 *
 * HTTPS ueberall, http nur auf der eigenen Maschine - genau das brauchen
 * Anwendungen auf dem Rechner des Nutzers, die einen Port aufmachen.
 */
function isAcceptableRedirectUri(uri: string): boolean {
    let url: URL
    try {
        url = new URL(uri)
    } catch {
        return false
    }
    if (url.protocol === "https:") {
        return true
    }
    if (url.protocol === "http:") {
        return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
    }
    // Eigene Schemata (etwa "meineapp://") sind fuer Anwendungen auf Telefonen
    // ueblich und hier bewusst nicht dabei: sie lassen sich von einer anderen
    // App beanspruchen, und Wattwerk hat keine, die es braeuchte.
    return false
}

function oauthError<T>(status: number, error: string, description: string): Response<T> {
    return Response.json(status, {error, error_description: description} as unknown as T, {
        "Cache-Control": "no-store",
    })
}
