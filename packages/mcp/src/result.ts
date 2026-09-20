import type {CallToolResult} from "@modelcontextprotocol/sdk/types.js"
import {WattwerkApiError} from "./api"

export function text(value: string): CallToolResult {
    return {content: [{type: "text", text: value}]}
}

/** Volle Genauigkeit - fuer alles, was der Aufrufer unveraendert zurueckschicken koennte. */
export function json(value: unknown): CallToolResult {
    return text(JSON.stringify(value, null, 2))
}

export function failed(message: string): CallToolResult {
    return {content: [{type: "text", text: message}], isError: true}
}

/**
 * Ein Fehler der API ist eine Antwort, kein Absturz.
 *
 * Wer hier eine Ausnahme durchliesse, bekaeme im Client "MCP error -32603" zu
 * sehen - und nicht den Satz, den die API geschickt hat. Genau der ist aber die
 * Information, aus der ein Modell den naechsten Schritt ableiten kann.
 */
export async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await run()
    } catch (error) {
        if (error instanceof WattwerkApiError) {
            return failed(`${error.code}: ${error.message}`)
        }
        return failed(error instanceof Error ? error.message : String(error))
    }
}
