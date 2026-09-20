import jwt from "jsonwebtoken"
import {
    Credentials,
    MCP_PUBLIC_URL,
    OAUTH_ACCESS_TOKEN_SECRET,
    OAUTH_ENABLED,
    OAUTH_ISSUER,
} from "./config"

/**
 * Dieser Dienst als OAuth-Resource-Server.
 *
 * Zwei Pflichten aus der Spezifikation stecken hier: das Metadatendokument, an
 * dem ein Client den Autorisierungsserver findet, und die Pruefung, dass ein
 * Token wirklich *fuer diesen Dienst* ausgestellt wurde. Ohne die zweite waere
 * jedes Token, das irgendein anderer Dienst desselben Ausstellers akzeptiert,
 * auch hier gueltig.
 */

export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource"

export function protectedResourceMetadata(): Record<string, unknown> {
    return {
        resource: MCP_PUBLIC_URL,
        authorization_servers: [OAUTH_ISSUER],
        scopes_supported: ["wattwerk:read", "wattwerk:write"],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://github.com/EliasPeeters/bikeTrainer/blob/main/docs/MCP.md",
    }
}

/**
 * Der Hinweis, an dem ein Client erkennt, wo er sich anmelden kann.
 *
 * Ohne `resource_metadata` im Header findet er das Metadatendokument nicht und
 * meldet nur, dass etwas nicht ging.
 */
export function challengeHeader(error?: string, description?: string): string {
    const parts = [
        `Bearer realm="wattwerk"`,
        `resource_metadata="${metadataURL()}"`,
        `scope="wattwerk:read wattwerk:write"`,
    ]
    if (error !== undefined) {
        parts.push(`error="${error}"`)
    }
    if (description !== undefined) {
        parts.push(`error_description="${description.replace(/"/g, "'")}"`)
    }
    return parts.join(", ")
}

function metadataURL(): string {
    const url = new URL(MCP_PUBLIC_URL)
    return `${url.protocol}//${url.host}${PROTECTED_RESOURCE_PATH}`
}

export type TokenCheck =
    | {ok: true; credentials: Credentials}
    | {ok: false; error: string; description: string}

/**
 * Prueft ein Zugangstoken aus dem Authorization-Header.
 *
 * `null` heisst: das ist kein OAuth-Token, der Aufrufer soll es anders deuten -
 * etwa als Auffrischungstoken.
 */
export function checkAccessToken(token: string): TokenCheck | null {
    if (!OAUTH_ENABLED) {
        return null
    }

    let payload: jwt.JwtPayload
    try {
        const verified = jwt.verify(token, OAUTH_ACCESS_TOKEN_SECRET, {
            // Die Empfaengerbindung, und der Grund, warum hier ueberhaupt
            // geprueft wird (RFC 8707, MCP-Spezifikation).
            audience: MCP_PUBLIC_URL,
            issuer: OAUTH_ISSUER,
        })
        if (typeof verified === "string") {
            return null
        }
        payload = verified
    } catch (error) {
        // Ein Token mit falschem Empfaenger ist etwas anderes als gar kein
        // OAuth-Token: das eine wird abgelehnt, das andere weitergereicht.
        if (error instanceof jwt.JsonWebTokenError && looksLikeOurToken(token)) {
            return {
                ok: false,
                error: "invalid_token",
                description: describe(error),
            }
        }
        return null
    }

    if (typeof payload.userID !== "number") {
        return {ok: false, error: "invalid_token", description: "Dem Token fehlt die Kennung des Nutzers."}
    }
    // Ein Token aus der gewoehnlichen Anmeldung hat keinen Bereich. Es hier
    // anzunehmen hiesse, die Abstufung zu umgehen.
    if (typeof payload.scope !== "string") {
        return {
            ok: false,
            error: "invalid_token",
            description: "Das ist kein OAuth-Token. Melde dich über den Autorisierungsserver an.",
        }
    }

    return {
        ok: true,
        credentials: {
            source: "header",
            accessToken: token,
            clientID: typeof payload.client_id === "string" ? payload.client_id : undefined,
        },
    }
}

/**
 * Sieht das ueberhaupt nach einem JWT aus?
 *
 * Ein Auffrischungstoken ist auch eins, deshalb ist das nur eine Form- und
 * keine Echtheitspruefung - sie entscheidet, ob ein Fehler gemeldet oder das
 * Token weitergereicht wird.
 */
function looksLikeOurToken(token: string): boolean {
    const parts = token.split(".")
    if (parts.length !== 3) {
        return false
    }
    try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>
        // Nur OAuth-Tokens tragen einen Bereich; ein Auffrischungstoken nicht.
        return typeof payload.scope === "string"
    } catch {
        return false
    }
}

function describe(error: jwt.JsonWebTokenError): string {
    if (error instanceof jwt.TokenExpiredError) {
        return "Das Zugangstoken ist abgelaufen."
    }
    if (error.message.includes("audience")) {
        return "Dieses Token wurde für einen anderen Dienst ausgestellt."
    }
    return "Das Zugangstoken wird nicht angenommen."
}
