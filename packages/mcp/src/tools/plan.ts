import {randomUUID} from "node:crypto"
import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import type {PlanEntryDTO, SavePlanRequest, WorkoutDTO} from "@wattwerk/shared"
import {z} from "zod"
import {WattwerkApiError, type WattwerkClient} from "../api"
import {planText, WEEKDAY_NAMES} from "../format"
import {failed, guard, text} from "../result"

const weekdaySchema = z
    .number()
    .int()
    .min(1)
    .max(7)
    .describe("Wochentag nach ISO 8601: 1 = Montag, 2 = Dienstag … 7 = Sonntag")

/**
 * Der Plan als Anfrage fuer `PUT /plan`. Die Reihenfolge je Tag ist die der
 * Liste - so, wie sie hier ankommt.
 */
export function toSavePlanRequest(entries: Array<Pick<PlanEntryDTO, "id" | "weekday" | "workoutID" | "workoutName">>): SavePlanRequest {
    const perDay = new Map<number, number>()
    return {
        entries: entries.map((entry) => {
            const sortIndex = perDay.get(entry.weekday) ?? 0
            perDay.set(entry.weekday, sortIndex + 1)
            return {
                id: entry.id,
                weekday: entry.weekday,
                workoutID: entry.workoutID,
                workoutName: entry.workoutName,
                sortIndex,
            }
        }),
    }
}

/** Nach Tag und Reihenfolge, wie die API sie liefert - sonst haengt ein neuer Eintrag irgendwo. */
function ordered(entries: PlanEntryDTO[]): PlanEntryDTO[] {
    return [...entries].sort((a, b) => a.weekday - b.weekday || a.sortIndex - b.sortIndex)
}

/**
 * Programme vorher nachschlagen, nicht blind einplanen.
 *
 * Die API nimmt jede Kennung an - sie soll auch ein Programm einplanen
 * koennen, das im selben Abgleich erst hochkommt. Ein Sprachmodell vertippt
 * sich aber eher, als dass es auf einen Abgleich wartet, und ein Eintrag mit
 * erfundener Kennung stuende als "nicht mehr verfuegbar" im Plan. Hier fliegt
 * so etwas vor dem Speichern auf, und der Name kommt gleich mit.
 */
async function lookUp(client: WattwerkClient, ids: string[]): Promise<Map<string, WorkoutDTO>> {
    const unique = [...new Set(ids.map((id) => id.toLowerCase()))]
    const found = await Promise.all(
        unique.map(async (id) => {
            try {
                return [id, await client.workout(id)] as const
            } catch (error) {
                // Die API sagt nur "nicht gefunden" - bei fuenf Kennungen auf
                // einmal ist die Frage aber, welche.
                if (error instanceof WattwerkApiError && error.status === 404) {
                    throw new WattwerkApiError(
                        404,
                        "NOT_FOUND",
                        `Kein Programm mit der Kennung ${id} - oder eines, das nicht sichtbar ist. ` +
                            "Nichts wurde gespeichert."
                    )
                }
                throw error
            }
        })
    )
    return new Map(found)
}

/**
 * Der Wochenplan: welches Programm an welchem Wochentag dran ist, jede Woche
 * gleich. Derselbe Plan wie in App und Web-Portal.
 */
export function registerPlanTools(server: McpServer, client: WattwerkClient) {
    server.registerTool(
        "get_plan",
        {
            title: "Wochenplan",
            description:
                "Der Wochenplan: je Wochentag die eingeplanten Programme, mit Dauer, Belastung und " +
                "Kennungen. Der Plan ist eine Vorlage und gilt jede Woche; was davon schon gefahren " +
                "wurde, zeigt list_sessions.",
            inputSchema: {},
            annotations: {readOnlyHint: true, openWorldHint: true},
        },
        async () =>
            await guard(async () => {
                const plan = await client.plan()
                return text(planText(plan.entries))
            })
    )

    server.registerTool(
        "add_workout_to_plan",
        {
            title: "Programm einplanen",
            description:
                "Plant ein Programm an einem Wochentag ein - hinten an das, was dort schon steht. " +
                "Der Rest des Plans bleibt unangetastet. Eigene, öffentliche und Katalog-Programme gehen.",
            inputSchema: {
                weekday: weekdaySchema,
                workoutID: z.string().describe("Kennung des Programms, etwa aus search_workouts oder list_my_workouts"),
            },
            annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: true},
        },
        async ({weekday, workoutID}) =>
            await guard(async () => {
                const [plan, workouts] = await Promise.all([client.plan(), lookUp(client, [workoutID])])
                const workout = workouts.get(workoutID.toLowerCase()) as WorkoutDTO
                // Hinten an den eigenen Tag, nicht hinten an die Woche. `sort` ist
                // stabil, die Reihenfolge innerhalb der Tage bleibt also stehen.
                const next = [
                    ...ordered(plan.entries),
                    {id: randomUUID(), weekday, workoutID: workout.id, workoutName: workout.name},
                ].sort((a, b) => a.weekday - b.weekday)
                const saved = await client.savePlan(toSavePlanRequest(next))
                return text(`${workout.name} am ${WEEKDAY_NAMES[weekday - 1]} eingeplant.\n\n${planText(saved.entries)}`)
            })
    )

    server.registerTool(
        "remove_from_plan",
        {
            title: "Aus dem Plan nehmen",
            description:
                "Nimmt einen Eintrag aus dem Wochenplan. Entweder über seine Eintrags-Kennung aus " +
                "get_plan, oder über Wochentag und Programm - dann fällt jeder Eintrag dieses " +
                "Programms an diesem Tag heraus. Das Programm selbst bleibt bestehen.",
            inputSchema: {
                entryID: z.string().optional().describe("Kennung des Eintrags aus get_plan"),
                weekday: weekdaySchema.optional(),
                workoutID: z.string().optional().describe("Zusammen mit weekday: welches Programm an dem Tag"),
            },
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({entryID, weekday, workoutID}) =>
            await guard(async () => {
                if (entryID === undefined && (weekday === undefined || workoutID === undefined)) {
                    return failed("Entweder entryID angeben, oder weekday und workoutID zusammen.")
                }
                const plan = await client.plan()
                const matches = (entry: PlanEntryDTO) =>
                    entryID !== undefined
                        ? entry.id === entryID.toLowerCase()
                        : entry.weekday === weekday && entry.workoutID === workoutID?.toLowerCase()
                const removed = plan.entries.filter(matches)
                if (removed.length === 0) {
                    return failed(`Kein passender Eintrag im Plan.\n\n${planText(plan.entries)}`)
                }
                const saved = await client.savePlan(toSavePlanRequest(ordered(plan.entries.filter((entry) => !matches(entry)))))
                const names = removed.map((entry) => `${entry.workoutName} (${WEEKDAY_NAMES[entry.weekday - 1]})`)
                return text(`Aus dem Plan genommen: ${names.join(", ")}.\n\n${planText(saved.entries)}`)
            })
    )

    server.registerTool(
        "set_plan",
        {
            title: "Wochenplan ersetzen",
            description:
                "Ersetzt den ganzen Wochenplan - was nicht in der Liste steht, ist danach nicht mehr " +
                "eingeplant. Gut für „plan mir eine Woche“; für einzelne Tage sind add_workout_to_plan " +
                "und remove_from_plan die schonendere Wahl. Eine leere Liste leert den Plan. " +
                "Innerhalb eines Tages gilt die Reihenfolge der Liste.",
            inputSchema: {
                entries: z
                    .array(z.object({weekday: weekdaySchema, workoutID: z.string().describe("Kennung des Programms")}))
                    .max(50)
                    .describe("Die Einträge des neuen Plans, höchstens 50"),
            },
            annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true},
        },
        async ({entries}) =>
            await guard(async () => {
                const workouts = await lookUp(client, entries.map((entry) => entry.workoutID))
                const next = [...entries]
                    .sort((a, b) => a.weekday - b.weekday)
                    .map((entry) => {
                        const workout = workouts.get(entry.workoutID.toLowerCase()) as WorkoutDTO
                        return {id: randomUUID(), weekday: entry.weekday, workoutID: workout.id, workoutName: workout.name}
                    })
                const saved = await client.savePlan(toSavePlanRequest(next))
                return text(`Wochenplan gespeichert.\n\n${planText(saved.entries)}`)
            })
    )
}
