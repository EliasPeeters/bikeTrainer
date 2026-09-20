import bodyParser from "body-parser"
import cls from "cls-hooked"
import compression from "compression"
import cors from "cors"
import express, {
    Express,
    NextFunction,
    Request as ExpressRequest,
    Response as ExpressResponse,
} from "express"
import {RouteParameters} from "express-serve-static-core"
import {IncomingHttpHeaders} from "node:http"
import {Socket} from "node:net"
import {ParsedQs} from "qs"
import {ApiErrorCode, ApiErrorResponse, ApiKeyScope} from "@wattwerk/shared"
import {CORS_ORIGINS, IS_PRODUCTION} from "./config/env"
import {Sequelize, Transaction} from "sequelize"
import {sequelize} from "./db/db"

/**
 * Sequelize findet die laufende Transaktion ueber diesen Namensraum selbst, so
 * dass kein Service sie durch seine Aufrufkette durchreichen muss. Das muss vor
 * dem ersten Query passieren, also beim Laden dieses Moduls.
 */
const transactionNamespace = cls.createNamespace("wattwerk-request")
Sequelize.useCLS(transactionNamespace)

/**
 * Außerhalb der Produktion jede Herkunft, in Produktion nur die
 * eingetragenen. Siehe `CORS_ORIGINS`.
 */
function corsOptions(): cors.CorsOptions {
    if (CORS_ORIGINS.length > 0) {
        return {origin: CORS_ORIGINS, credentials: true}
    }
    if (IS_PRODUCTION) {
        console.warn("[CORS] CORS_ORIGINS ist leer - Browseraufrufe von fremden Herkünften werden abgelehnt.")
        return {origin: false}
    }
    return {origin: true}
}

export class Server {
    app: Express
    private errorHandlingConfigured = false

    jsonParser = bodyParser.json({limit: "1mb"})

    constructor() {
        this.app = express()
        this.app.disable("x-powered-by")
        // Hinter dem Reverse Proxy ist die IP im Header, nicht am Socket.
        this.app.set("trust proxy", true)
        this.app.use(cors(corsOptions()))
        this.configureCompression()
        this.configureLogging()
    }

    private configureCompression() {
        this.app.use(compression({
            // Kleine Antworten zu komprimieren kostet mehr CPU als es Bytes
            // spart; die meisten Antworten hier sind wenige hundert Byte.
            threshold: 1024,
        }))
    }

    private configureLogging() {
        this.app.use((request: ExpressRequest, response: ExpressResponse, next: NextFunction) => {
            const startedAt = process.hrtime.bigint()
            response.on("finish", () => {
                const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
                console.log(
                    `[HTTP] ${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs.toFixed(1)}ms`
                )
            })
            next()
        })
    }

    /**
     * Schliesst die Routenliste ab: 404 und Fehlerbehandlung.
     *
     * Muss nach allen Routen registriert werden, sonst greift Express den
     * Fehler nicht ab. Oeffentlich, weil auch die Tests den fertigen Server
     * brauchen - sonst faehrt `supertest` gegen einen anderen Stapel als die
     * Produktion, und genau die Faelle, die hier geregelt werden, sind dort
     * ungetestet.
     */
    public finalize() {
        if (this.errorHandlingConfigured) {
            return
        }
        this.errorHandlingConfigured = true

        this.app.use((request: ExpressRequest, response: ExpressResponse) => {
            failure<unknown>(404, "NOT_FOUND", "Diese Route gibt es nicht.").buildResponse(response)
        })

        this.app.use((error: Error, request: ExpressRequest, response: ExpressResponse, next: NextFunction) => {
            console.error(`[ERROR] ${request.method} ${request.originalUrl}`, {
                name: error?.name,
                message: error?.message,
                stack: error?.stack,
            })
            if (response.headersSent) {
                next(error)
                return
            }
            // Nach aussen nie die Fehlermeldung selbst: sie enthaelt bei
            // Datenbankfehlern das SQL samt Parametern.
            failure<unknown>(500, "INTERNAL", "Interner Fehler.").buildResponse(response)
        })
    }

    public listen(port: number) {
        this.finalize()
        const server = this.app.listen(port, () => {
            console.log(`[SERVER] Wattwerk API hoert auf Port ${port}`)
        })

        // Laufende Requests zu Ende bedienen, statt sie beim Deploy abzuschneiden.
        for (const signal of ["SIGTERM", "SIGINT"] as const) {
            process.once(signal, () => {
                console.log(`[SERVER] ${signal} erhalten, fahre herunter`)
                server.close(() => {
                    void sequelize.close().finally(() => process.exit(0))
                })
            })
        }

        return server
    }

    public route<Route extends string, Options extends RequestOptions>(path: Route, options: Options) {
        return {
            get: <ResponseBody>(handler: Handler<Options, Route, void, ResponseBody>) => {
                this.app.get(path, this.jsonParser, (expressRequest, expressResponse, next) => {
                    void wrapRequest(options, expressRequest as never, expressResponse as never, next, handler)
                })
            },
            delete: <ResponseBody>(handler: Handler<Options, Route, void, ResponseBody>) => {
                this.app.delete(path, this.jsonParser, (expressRequest, expressResponse, next) => {
                    void wrapRequest(options, expressRequest as never, expressResponse as never, next, handler)
                })
            },
            postJSON: <RequestBody, ResponseBody>(handler: Handler<Options, Route, RequestBody, ResponseBody>) => {
                this.app.post(path, this.jsonParser, (expressRequest, expressResponse, next) => {
                    void wrapRequest(options, expressRequest as never, expressResponse as never, next, handler)
                })
            },
            putJSON: <RequestBody, ResponseBody>(handler: Handler<Options, Route, RequestBody, ResponseBody>) => {
                this.app.put(path, this.jsonParser, (expressRequest, expressResponse, next) => {
                    void wrapRequest(options, expressRequest as never, expressResponse as never, next, handler)
                })
            },
        }
    }
}

// MARK: - Routen-Optionen

/**
 * `allowApiKey: false` schliesst Zugangsschluessel aus und verlangt eine echte
 * Anmeldung. Das gilt fuer die Routen, mit denen man Schluessel verwaltet oder
 * das Konto loescht: sonst koennte sich ein abgegriffener Schluessel selbst
 * verlaengern, indem er einen zweiten anlegt, und das Zuruecknehmen liefe ins
 * Leere.
 */
export type RequestOptions =
    | {
          authenticated: false
          databaseTransaction?: boolean
      }
    | {
          authenticated: true
          databaseTransaction?: boolean
          /** `true` laedt den Nutzer und legt ihn in `request.user`. */
          includeUser?: false
          allowApiKey?: boolean
      }
    | {
          authenticated: true
          databaseTransaction?: boolean
          includeUser: true
          allowApiKey?: boolean
      }

/**
 * Der Typ des Request-Objekts haengt an den Optionen: nur mit
 * `{authenticated: true, includeUser: true}` gibt es `request.user`, und zwar
 * ohne Optionalitaet. Wer den Nutzer braucht, bekommt ihn vom Compiler
 * garantiert - statt ihn im Handler auf `undefined` pruefen zu muessen.
 */
export type RequestType<Options extends RequestOptions, Parameter, Body> =
    Options extends {authenticated: true; includeUser: true}
        ? AuthenticatedRequest<Parameter, Body>
        : Request<Parameter, Body>

type Handler<Options extends RequestOptions, Route extends string, RequestBody, ResponseBody> =
    (request: RequestType<Options, RouteParameters<Route>, RequestBody>) => Promise<Response<ResponseBody>>

export interface Request<Parameter, Body> {
    body: Body
    headers: IncomingHttpHeaders
    parameter: Parameter
    query: ParsedQs
    socket: Socket
    ip: string
    /**
     * Gesetzt, wenn ein gueltiges Token dabei war - auch auf Routen ohne
     * Anmeldepflicht. Eine Route, die vor und nach dem Login funktioniert, muss
     * die Identitaet sonst aus dem Koerper nehmen, und der ist nicht
     * vertrauenswuerdig.
     */
    authenticatedUserID?: number
}

export interface AuthenticatedRequest<Parameter, Body> extends Request<Parameter, Body> {
    user: DBUserType
}

/**
 * Nur der Typ, nicht das Modul: `server.ts` wird von den Tests ohne Datenbank
 * geladen, und ein Wert-Import von `DBUser` zoege `db.ts` und damit eine
 * Verbindung mit herein.
 */
type DBUserType = import("./db/DBUser").DBUser

interface RequestLocals {
    userID?: number
    /** Gesetzt, wenn die Identitaet aus einem Zugangsschluessel kommt. */
    apiKeyScope?: ApiKeyScope
    [key: string]: unknown
}

// MARK: - Ausfuehrung

async function wrapRequest<Options extends RequestOptions, RequestBody, ResponseBody, Route extends string>(
    options: RequestOptions,
    expressRequest: ExpressRequest<RouteParameters<Route>, ResponseBody | string, RequestBody, ParsedQs, RequestLocals>,
    expressResponse: ExpressResponse<ResponseBody | string, RequestLocals>,
    next: NextFunction,
    handler: Handler<Options, Route, RequestBody, ResponseBody>
) {
    const useDatabaseTransaction = options.databaseTransaction ?? true

    try {
        const userID = expressResponse.locals.userID

        if (options.authenticated && userID === undefined) {
            failure<ResponseBody>(401, "UNAUTHORIZED", "Anmeldung erforderlich.").buildResponse(expressResponse)
            return
        }

        const apiKeyScope = expressResponse.locals.apiKeyScope
        if (apiKeyScope !== undefined && options.authenticated) {
            if (options.allowApiKey === false) {
                failure<ResponseBody>(
                    403,
                    "UNAUTHORIZED",
                    "Das geht nur mit einer richtigen Anmeldung, nicht mit einem Zugangsschlüssel."
                ).buildResponse(expressResponse)
                return
            }
            // Lesen heisst GET. Die Regel steht hier und nicht in jedem
            // Handler, weil eine vergessene Pruefung sonst stillschweigend
            // Schreibrecht gaebe - und genau das soll `read` ausschliessen.
            if (apiKeyScope === "read" && expressRequest.method !== "GET") {
                failure<ResponseBody>(
                    403,
                    "UNAUTHORIZED",
                    "Dieser Zugangsschlüssel darf nur lesen."
                ).buildResponse(expressResponse)
                return
            }
        }

        const baseRequest: Request<RouteParameters<Route>, RequestBody> = {
            body: expressRequest.body,
            headers: expressRequest.headers,
            parameter: expressRequest.params,
            query: expressRequest.query,
            socket: expressRequest.socket,
            ip: extractClientIP(expressRequest),
            authenticatedUserID: userID,
        }

        const response = await handlerWithTransaction(useDatabaseTransaction, async () => {
            if (options.authenticated && options.includeUser === true) {
                // Der Nutzer wird innerhalb der Transaktion geladen, nicht davor:
                // eine eigene Transaktion nur fuer diese eine Abfrage kostet ein
                // zusaetzliches BEGIN und COMMIT auf jedem angemeldeten Request.
                const {DBUser} = await import("./db/DBUser")
                const user = await DBUser.findByPk(userID as number)

                if (user === null) {
                    // Token gueltig, Nutzer geloescht.
                    return failure<ResponseBody>(401, "UNAUTHORIZED", "Anmeldung erforderlich.")
                }

                const authenticatedRequest: AuthenticatedRequest<RouteParameters<Route>, RequestBody> = {
                    ...baseRequest,
                    user,
                }
                return await handler(authenticatedRequest as RequestType<Options, RouteParameters<Route>, RequestBody>)
            }

            return await handler(baseRequest as RequestType<Options, RouteParameters<Route>, RequestBody>)
        })

        response.buildResponse(expressResponse)
    } catch (error) {
        next(error)
    }
}

async function handlerWithTransaction<Res>(useTransaction: boolean, handler: () => Promise<Res>): Promise<Res> {
    if (!useTransaction) {
        return await handler()
    }

    const transaction = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    })
    const isFinished = () =>
        (transaction as Transaction & {finished?: "commit" | "rollback"}).finished !== undefined

    return await transactionNamespace.runAndReturn(async () => {
        transactionNamespace.set("transaction", transaction)
        try {
            const response = await handler()
            // Eine Antwort darf die Transaktion verwerfen, ohne zu werfen - so
            // kann ein Handler eine Fehlermeldung zurueckgeben und trotzdem
            // sicher sein, dass nichts halb Geschriebenes stehen bleibt.
            if (response instanceof Response && response.rollbackTransaction) {
                if (!isFinished()) {
                    await transaction.rollback()
                }
            } else if (!isFinished()) {
                await transaction.commit()
            }
            return response
        } catch (error) {
            if (!isFinished()) {
                await transaction.rollback()
            }
            throw error
        } finally {
            transactionNamespace.set("transaction", null)
        }
    })
}

/**
 * Die IP des Aufrufers. `x-forwarded-for` kann eine Liste sein
 * ("client, proxy1, proxy2") - der erste Eintrag ist der Aufrufer, alles
 * dahinter die eigene Kette. Die Ratenbegrenzung haengt daran, also steht das
 * an genau einer Stelle.
 */
export function extractClientIP(request: {headers: IncomingHttpHeaders; socket: Socket}): string {
    const forwarded = request.headers["x-forwarded-for"] ?? request.headers["x-real-ip"]
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
    const candidate = (raw ?? request.socket.remoteAddress ?? "").split(",")[0].trim()
    return candidate.length > 0 ? candidate : "unknown"
}

// MARK: - Antworten

export class Response<Body> {
    rollbackTransaction: boolean
    private responseBuilder: (response: ExpressResponse<Body | string, Record<string, unknown>>) => void

    constructor(
        rollbackTransaction: boolean,
        responseBuilder: (response: ExpressResponse<Body | string, Record<string, unknown>>) => void
    ) {
        this.rollbackTransaction = rollbackTransaction
        this.responseBuilder = responseBuilder
    }

    public buildResponse(response: ExpressResponse<Body | string, Record<string, unknown>>) {
        this.responseBuilder(response)
    }

    static json<T>(code: number, object: T, headers: Record<string, string> = {}): Response<T> {
        return new Response(false, (response) => {
            let builder = response.status(code)
            for (const [name, value] of Object.entries(headers)) {
                builder = builder.header(name, value)
            }
            builder.json(object)
        })
    }

    static raw(code: number, body: string, contentType: string): Response<string> {
        return new Response(false, (response) => {
            response.status(code).header("Content-Type", contentType).send(body)
        })
    }

    static error<Body>(code: number, message?: string, rollbackTransaction = false): Response<Body> {
        return new Response(rollbackTransaction, (response) => {
            if (message === undefined) {
                response.sendStatus(code)
            } else {
                response.status(code).send(message)
            }
        })
    }

    static redirect<Body>(url: string): Response<Body> {
        return new Response(false, (response) => {
            response.redirect(url)
        })
    }
}

/**
 * Der Standardfehler dieser API.
 *
 * Ein maschinenlesbarer Code plus ein Satz fuer Menschen: die Landingpage
 * unterscheidet "E-Mail schon vergeben" von "Passwort zu kurz" am Code, nicht
 * am Text - sonst bricht jede Umformulierung das Frontend. Die Transaktion wird
 * dabei immer verworfen, weil ein Fehler nichts halb Geschriebenes hinterlassen
 * darf.
 */
export function failure<Body>(code: number, error: ApiErrorCode, message: string): Response<Body> {
    return new Response<Body>(true, (response) => {
        const body: ApiErrorResponse = {error, message}
        response.status(code).json(body as unknown as Body)
    })
}
