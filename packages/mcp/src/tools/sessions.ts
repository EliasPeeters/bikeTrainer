import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {z} from "zod"
import type {WattwerkClient} from "../api"
import {clock, count, sessionLine} from "../format"
import {guard, text} from "../result"

/**
 * Der Verlauf: was tatsaechlich gefahren wurde.
 *
 * Aufgezeichnet wird normalerweise von der App. Das Werkzeug zum Nachtragen
 * gibt es trotzdem, weil die API es hergibt - etwa fuer eine Einheit, die
 * ausserhalb gefahren wurde.
 */
export function registerSessionTools(server: McpServer, client: WattwerkClient) {
    server.registerTool(
        "list_sessions",
        {
            title: "Verlauf",
            description:
                "Die gefahrenen Einheiten, neueste zuerst, dazu die Belastung der letzten sieben Tage. " +
                "Das ist die Grundlage für jede Auswertung: Form, Wochenumfang, was zuletzt gefahren wurde.",
            inputSchema: {
                limit: z.number().int().optional().describe("Höchstens 200, Standard 50"),
            },
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async ({limit}) =>
            await guard(async () => {
                const response = await client.sessions(limit)
                if (response.sessions.length === 0) {
                    return text("Noch keine Einheiten aufgezeichnet.")
                }
                const total = response.sessions.reduce(
                    (sum, session) => sum + session.durationSeconds,
                    0
                )
                return text(
                    `${count(response.sessions.length, "Einheit", "Einheiten")} · ${clock(total)} gesamt · ` +
                        `${Math.round(response.stressLastSevenDays)} TSS in den letzten 7 Tagen\n\n` +
                        response.sessions.map(sessionLine).join("\n")
                )
            })
    )

    server.registerTool(
        "log_session",
        {
            title: "Einheit nachtragen",
            description:
                "Trägt eine gefahrene Einheit in den Verlauf ein. Normalerweise macht das die App; " +
                "hier nützlich, um etwas nachzutragen. Ein zweiter Aufruf mit derselben clientID " +
                "überschreibt den Eintrag, statt ihn zu verdoppeln.",
            inputSchema: {
                clientID: z
                    .string()
                    .max(36)
                    .describe("Eindeutige Kennung dieser Einheit, höchstens 36 Zeichen - am besten eine UUID"),
                workoutName: z.string().describe("Name des gefahrenen Programms"),
                workoutID: z
                    .string()
                    .optional()
                    .describe("Kennung des Programms, falls es eins auf dem Server gibt"),
                startedAt: z.string().describe("Startzeit als ISO-8601 mit Zeitzone, etwa 2026-09-20T18:30:00+02:00"),
                durationSeconds: z.number().int().positive().describe("Fahrzeit in Sekunden, höchstens 24 Stunden"),
                completed: z.boolean().describe("false, wenn die Einheit abgebrochen wurde"),
                ftp: z.number().describe("FTP, mit der gefahren wurde"),
                averagePower: z.number().describe("Durchschnittsleistung in Watt"),
                maxPower: z.number().describe("Maximalleistung in Watt"),
                normalizedPower: z.number().describe("Normalisierte Leistung in Watt"),
                intensityFactor: z.number().describe("Normalisierte Leistung geteilt durch FTP"),
                trainingStressScore: z.number().describe("Belastung der Einheit (TSS)"),
                kilojoules: z.number().describe("Verrichtete Arbeit in Kilojoule"),
                averageCadence: z.number().optional().describe("Durchschnittliche Trittfrequenz"),
                averageHeartRate: z.number().optional().describe("Durchschnittliche Herzfrequenz"),
                maxHeartRate: z.number().optional().describe("Maximale Herzfrequenz"),
            },
            annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
        },
        async (args) =>
            await guard(async () => {
                const session = await client.createSession(args)
                return text(`Eingetragen.\n\n${sessionLine(session)}`)
            })
    )

    server.registerTool(
        "delete_session",
        {
            title: "Einheit löschen",
            description: "Nimmt eine Einheit endgültig aus dem Verlauf.",
            inputSchema: {
                id: z.number().int().describe("Numerische Kennung aus list_sessions"),
            },
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({id}) =>
            await guard(async () => {
                await client.deleteSession(id)
                return text(`Einheit ${id} gelöscht.`)
            })
    )
}
