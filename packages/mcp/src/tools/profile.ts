import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {z} from "zod"
import type {WattwerkClient} from "../api"
import {profileText} from "../format"
import {guard, text} from "../result"

/**
 * Profil und Erreichbarkeit der API.
 *
 * Das Profil ist mehr als Kosmetik: die FTP ist die Bezugsgroesse jedes
 * Programms, das seine Ziele in Prozent angibt. Wer eine Einheit planen soll,
 * sollte sie kennen.
 */
export function registerProfileTools(server: McpServer, client: WattwerkClient) {
    server.registerTool(
        "get_profile",
        {
            title: "Fahrerprofil",
            description:
                "Das eigene Profil: FTP, Gewicht, Herzfrequenzen. Die FTP ist der Bezugswert aller " +
                "Programme mit Zielen in Prozent - vor dem Planen einer Einheit lohnt sich der Blick.",
            inputSchema: {},
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async () =>
            await guard(async () => {
                return text(profileText(await client.profile()))
            })
    )

    server.registerTool(
        "update_profile",
        {
            title: "Profil ändern",
            description:
                "Ändert die Werte des Fahrerprofils. Nur was mitgeschickt wird, wird geändert. " +
                "Grenzen: FTP 50-600 W, maximale Herzfrequenz 120-230, Ruhepuls 30-100, Gewicht 30-250 kg.",
            inputSchema: {
                name: z.string().optional().describe("Anzeigename"),
                ftp: z.number().int().optional().describe("Schwellenleistung in Watt (50-600)"),
                maxHeartRate: z.number().int().optional().describe("Maximale Herzfrequenz (120-230)"),
                restingHeartRate: z.number().int().optional().describe("Ruhepuls (30-100)"),
                weightKg: z.number().optional().describe("Gewicht in Kilogramm (30-250)"),
                mailContactAllowed: z.boolean().optional().describe("Einwilligung in Produktmails"),
            },
            annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
        },
        async (args) =>
            await guard(async () => {
                return text(`Gespeichert.\n\n${profileText(await client.updateProfile(args))}`)
            })
    )

    server.registerTool(
        "api_health",
        {
            title: "API erreichbar?",
            description:
                "Prüft, ob die API und ihre Datenbank antworten. Der erste Aufruf, wenn etwas anderes " +
                "unerwartet scheitert - er braucht kein Konto.",
            inputSchema: {},
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async () =>
            await guard(async () => {
                const health = await client.health()
                return text(
                    `Status: ${health.status} · Datenbank: ${health.database} · ` +
                        `läuft seit ${Math.round(health.uptimeSeconds / 60)} min`
                )
            })
    )
}
