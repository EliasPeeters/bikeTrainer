import {
    ApiKeyListResponse,
    ApiKeyScope,
    CreateApiKeyRequest,
    CreateApiKeyResponse,
} from "@wattwerk/shared"
import {DBApiKey} from "../db/DBApiKey"
import {apiKeyPreview, generateApiKey, hashApiKey} from "./ApiKeyToken"
import {failure, Response, Server} from "../server"
import {sanitizeName} from "./Validation"

const MAX_KEYS_PER_USER = 25
/**
 * `lastUsedAt` wird nur nachgezogen, wenn der letzte Eintrag alt genug ist.
 * Sonst waere jede Leseanfrage auch ein Schreibvorgang - bei einem Assistenten,
 * der zehn Werkzeuge hintereinander aufruft, zehn Updates auf dieselbe Zeile.
 */
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000

/**
 * Zugangsschlüssel anlegen, auflisten, zurücknehmen.
 *
 * Die Routen sind bewusst nicht mit einem Schlüssel erreichbar
 * (`allowDelegated: false`): sonst könnte sich ein abgegriffener Schlüssel selbst
 * verlängern, indem er einen zweiten anlegt, und das Zurücknehmen liefe ins
 * Leere.
 */
export class ApiKeyService {
    public configure(server: Server) {
        server
            .route("/me/keys", {authenticated: true, includeUser: true, allowDelegated: false})
            .get<ApiKeyListResponse>(async (request) => {
                const keys = await DBApiKey.findAll({
                    where: {userID: request.user.id},
                    order: [["createdAt", "DESC"]],
                })
                return Response.json(200, {keys: keys.map((key) => key.toResponse())})
            })

        server
            .route("/me/keys", {authenticated: true, includeUser: true, allowDelegated: false})
            .postJSON<CreateApiKeyRequest, CreateApiKeyResponse>(async (request) => {
                const body = request.body
                if (body === null || typeof body !== "object") {
                    return failure(400, "INVALID_BODY", "Der Anfragekörper fehlt.")
                }
                if (typeof body.name !== "string" || body.name.trim().length === 0) {
                    return failure(400, "INVALID_BODY", "Der Schlüssel braucht einen Namen.")
                }

                const count = await DBApiKey.count({where: {userID: request.user.id}})
                if (count >= MAX_KEYS_PER_USER) {
                    return failure(400, "INVALID_BODY", `Mehr als ${MAX_KEYS_PER_USER} Schlüssel sind nicht vorgesehen.`)
                }

                const expiresAt = parseExpiry(body.expiresInDays)
                if (expiresAt === "invalid") {
                    return failure(400, "INVALID_BODY", "expiresInDays liegt außerhalb von 1 bis 3650.")
                }

                const token = generateApiKey()
                const scope: ApiKeyScope = body.scope === "read" ? "read" : "full"
                const key = await DBApiKey.create({
                    userID: request.user.id,
                    name: sanitizeName(body.name),
                    tokenHash: hashApiKey(token),
                    preview: apiKeyPreview(token),
                    scope,
                    expiresAt,
                })

                // Das einzige Mal, dass der Schlüssel selbst die API verlässt.
                return Response.json(201, {key: key.toResponse(), token})
            })

        server
            .route("/me/keys/:id", {authenticated: true, includeUser: true, allowDelegated: false})
            .delete<{deleted: boolean}>(async (request) => {
                const id = parseInt(request.parameter.id, 10)
                if (!Number.isFinite(id)) {
                    return failure(400, "INVALID_BODY", "Ungültige Kennung.")
                }
                // userID gehoert in die Bedingung, nicht in eine Pruefung danach:
                // sonst nimmt eine geratene Kennung fremde Schluessel zurueck.
                const removed = await DBApiKey.destroy({where: {id, userID: request.user.id}})
                if (removed === 0) {
                    return failure(404, "NOT_FOUND", "Diesen Schlüssel gibt es nicht.")
                }
                return Response.json(200, {deleted: true})
            })
    }
}

export interface ResolvedApiKey {
    userID: number
    scope: ApiKeyScope
}

/**
 * `null`, wenn der Schlüssel nicht existiert oder abgelaufen ist.
 *
 * Gesucht wird über den Hash und den eindeutigen Index - der Schlüssel selbst
 * steht nirgends in der Datenbank, also kann ihn auch niemand dort ablesen.
 */
export async function resolveApiKey(token: string): Promise<ResolvedApiKey | null> {
    const key = await DBApiKey.findOne({where: {tokenHash: hashApiKey(token)}})
    if (key === null || key.isExpired()) {
        return null
    }

    const lastUsed = key.lastUsedAt?.getTime() ?? 0
    if (Date.now() - lastUsed > LAST_USED_RESOLUTION_MS) {
        // Bewusst ohne await: ob der Zeitstempel eine Sekunde spaeter steht,
        // darf keinen Request aufhalten.
        void key.update({lastUsedAt: new Date()}).catch(() => undefined)
    }

    return {userID: key.userID, scope: key.scope}
}

/** `"invalid"`, wenn die Angabe unbrauchbar ist; `null` heißt "laeuft nie ab". */
function parseExpiry(days: unknown): Date | null | "invalid" {
    if (days === undefined || days === null) {
        return null
    }
    if (typeof days !== "number" || !Number.isFinite(days) || days < 1 || days > 3650) {
        return "invalid"
    }
    return new Date(Date.now() + Math.round(days) * 24 * 60 * 60 * 1000)
}
