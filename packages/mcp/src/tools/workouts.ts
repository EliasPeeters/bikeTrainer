import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {z} from "zod"
import type {WattwerkClient} from "../api"
import {clock, count, workoutDetail, workoutList} from "../format"
import {guard, json, text} from "../result"
import {toSaveWorkoutRequest, workoutInputShape} from "../schemas"

/**
 * Programme: lesen, suchen, anlegen, aendern, loeschen.
 *
 * Ein "Template" im Sprachgebrauch der Bibliothek ist hier ein Programm mit
 * `visibility: public` - die API kennt keine zweite Sorte. Deshalb gibt es kein
 * eigenes Werkzeug dafuer, sondern `search_workouts` durchsucht genau diesen
 * oeffentlichen Bestand.
 */
export function registerWorkoutTools(server: McpServer, client: WattwerkClient) {
    server.registerTool(
        "list_my_workouts",
        {
            title: "Eigene Programme",
            description:
                "Alle Programme des angemeldeten Kontos, zuletzt geändertes zuerst. " +
                "Gibt je Programm eine Zeile mit Kennung, Dauer, TSS und Sichtbarkeit - " +
                "für die Blöcke eines einzelnen Programms get_workout benutzen.",
            inputSchema: {},
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async () =>
            await guard(async () => {
                const workouts = await client.ownWorkouts()
                return text(
                    `${count(workouts.length, "eigenes Programm", "eigene Programme")}\n\n` +
                        workoutList(workouts, "Noch keine eigenen Programme.")
                )
            })
    )

    server.registerTool(
        "search_workouts",
        {
            title: "Öffentliche Programme suchen",
            description:
                "Durchsucht die öffentlich geteilten Programme und den mitgelieferten Katalog - " +
                "die Vorlagen, aus denen man sich bedienen kann. Ohne Filter kommen die zuletzt " +
                "geänderten. Funktioniert auch ohne Konto.",
            inputSchema: {
                query: z.string().optional().describe("Sucht in Name und Beschreibung"),
                tag: z.string().optional().describe("Genau ein Schlagwort, etwa \"Schwelle\""),
                minDurationSeconds: z.number().int().optional().describe("Nur Programme ab dieser Dauer"),
                maxDurationSeconds: z.number().int().optional().describe("Nur Programme bis zu dieser Dauer"),
                limit: z.number().int().optional().describe("Höchstens 100, Standard 40"),
            },
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async (args) =>
            await guard(async () => {
                const workouts = await client.publicWorkouts(args)
                return text(
                    `${count(workouts.length, "Treffer", "Treffer")}\n\n` +
                        workoutList(workouts, "Nichts gefunden. Weniger Filter versuchen.")
                )
            })
    )

    server.registerTool(
        "get_workout",
        {
            title: "Programm im Detail",
            description:
                "Ein einzelnes Programm mit allen Blöcken. Standardmäßig lesbar aufbereitet; " +
                "mit raw=true kommt das rohe JSON, so wie update_workout es wieder entgegennimmt.",
            inputSchema: {
                id: z.string().describe("Kennung des Programms"),
                raw: z
                    .boolean()
                    .optional()
                    .describe("true liefert das vollständige JSON - nötig, um ein Programm zu ändern"),
            },
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async ({id, raw}) =>
            await guard(async () => {
                const workout = await client.workout(id)
                return raw === true ? json(workout) : text(workoutDetail(workout))
            })
    )

    server.registerTool(
        "create_workout",
        {
            title: "Programm anlegen",
            description:
                "Legt ein neues Trainingsprogramm an. Dauer und Belastung (TSS) rechnet der Server " +
                "aus den Blöcken aus. Ziele in percentFTP sind die bessere Wahl: sie passen sich der " +
                "FTP jedes Fahrers an, absolute Watt nicht.",
            inputSchema: workoutInputShape,
            annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: true},
        },
        async (args) =>
            await guard(async () => {
                const workout = await client.saveWorkout(toSaveWorkoutRequest(args))
                return text(`Angelegt.\n\n${workoutDetail(workout)}`)
            })
    )

    server.registerTool(
        "update_workout",
        {
            title: "Programm ändern",
            description:
                "Überschreibt ein eigenes Programm vollständig - was nicht mitgeschickt wird, ist danach " +
                "weg. Vorher get_workout mit raw=true holen und darauf aufbauen. Programme aus dem " +
                "Katalog und fremde Programme lassen sich nicht ändern; davon legt man sich mit " +
                "create_workout eine Kopie an.",
            inputSchema: {
                id: z.string().describe("Kennung des zu ändernden Programms"),
                ...workoutInputShape,
            },
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({id, ...rest}) =>
            await guard(async () => {
                const workout = await client.updateWorkout(id, toSaveWorkoutRequest(rest, id))
                return text(`Geändert.\n\n${workoutDetail(workout)}`)
            })
    )

    server.registerTool(
        "delete_workout",
        {
            title: "Programm löschen",
            description:
                "Löscht ein eigenes Programm endgültig. Gefahrene Einheiten bleiben im Verlauf stehen.",
            inputSchema: {id: z.string().describe("Kennung des Programms")},
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({id}) =>
            await guard(async () => {
                await client.deleteWorkout(id)
                return text(`Programm ${id} gelöscht.`)
            })
    )

    server.registerTool(
        "import_workouts",
        {
            title: "Mehrere Programme auf einmal",
            description:
                "Legt bis zu 200 Programme in einem Aufruf an oder aktualisiert sie. Gedacht für den " +
                "Abgleich - etwa wenn eine ganze Trainingswoche auf einmal entsteht. Antwortet mit " +
                "allen eigenen Programmen danach.",
            inputSchema: {
                workouts: z
                    .array(z.object({id: z.string().optional(), ...workoutInputShape}))
                    .min(1)
                    .describe("Mit id wird das bestehende Programm überschrieben, ohne id neu angelegt"),
            },
            annotations: {readOnlyHint: false, destructiveHint: true, openWorldHint: true},
        },
        async ({workouts}) =>
            await guard(async () => {
                const saved = await client.syncWorkouts(
                    workouts.map(({id, ...rest}) => toSaveWorkoutRequest(rest, id))
                )
                return text(
                    `${count(workouts.length, "Programm", "Programme")} übertragen. ` +
                        `Das Konto hat jetzt ${saved.length}:\n\n` +
                        workoutList(saved, "")
                )
            })
    )

    server.registerTool(
        "browse_library",
        {
            title: "Bibliothek",
            description:
                "Die Startseite der Bibliothek, so wie App und Web-Portal sie zeigen: fertige Reihen " +
                "wie \"Zuletzt gefahren\", \"Top-Tipps\" oder \"Aus dem Katalog\". Der beste erste Aufruf, " +
                "um zu sehen, was überhaupt da ist.",
            inputSchema: {},
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async () =>
            await guard(async () => {
                const discovery = await client.discover()
                const rows = discovery.rows.map((row) => {
                    const head = row.subtitle === undefined ? row.title : `${row.title} — ${row.subtitle}`
                    return `## ${head}\n${workoutList(row.workouts, "")}`
                })
                const collections =
                    discovery.collections.length === 0
                        ? ""
                        : `\n\n## Deine Sammlungen\n${discovery.collections
                              .map(
                                  (collection) =>
                                      `- ${collection.name} (${count(collection.workouts.length, "Programm", "Programme")}, ` +
                                      `${clock(
                                          collection.workouts.reduce(
                                              (sum, workout) => sum + workout.durationSeconds,
                                              0
                                          )
                                      )})\n  id: ${collection.id}`
                              )
                              .join("\n")}`
                return text(`${rows.join("\n\n")}${collections}`)
            })
    )
}
