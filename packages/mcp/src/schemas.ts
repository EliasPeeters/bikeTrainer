import type {SaveWorkoutRequest, WorkoutSegmentDTO} from "@wattwerk/shared"
import {z} from "zod"

/**
 * Die Eingaben der Werkzeuge.
 *
 * Die Beschreibungen sind kein Kommentar, sondern Teil der Schnittstelle: sie
 * landen im Werkzeugverzeichnis, das der Client dem Modell zeigt. Ohne sie
 * raet das Modell, ob `value: 0.9` neunzig Prozent oder neun Watt heisst.
 */

export const powerTargetSchema = z
    .object({
        type: z
            .enum(["watts", "percentFTP", "free"])
            .describe(
                "watts = feste Wattzahl, percentFTP = Anteil der FTP des Fahrers, free = keine Vorgabe"
            ),
        value: z
            .number()
            .optional()
            .describe(
                "Bei watts die Wattzahl (0-2000), bei percentFTP der Anteil als Bruch: 0.9 heißt 90 % FTP (0-4). Bei free weglassen."
            ),
    })
    .describe("Leistungsvorgabe eines Blocks")

export const segmentSchema = z.object({
    title: z.string().optional().describe("Aufschrift des Blocks, etwa \"Intervall 3\""),
    durationSeconds: z.number().int().positive().describe("Dauer in Sekunden, höchstens 4 Stunden"),
    target: powerTargetSchema,
    targetEnd: powerTargetSchema
        .optional()
        .describe("Gesetzt heißt Rampe: linear von target auf targetEnd über die Dauer des Blocks"),
    cadenceLow: z.number().int().optional().describe("Untere Trittfrequenz (20-200). Nur zusammen mit cadenceHigh."),
    cadenceHigh: z.number().int().optional().describe("Obere Trittfrequenz (20-200). Nur zusammen mit cadenceLow."),
})

export const workoutInputShape = {
    name: z.string().min(1).describe("Name des Programms"),
    summary: z.string().optional().describe("Ein bis zwei Sätze, worum es in der Einheit geht"),
    tags: z.array(z.string()).optional().describe("Bis zu 10 Schlagwörter, etwa [\"Schwelle\", \"kurz\"]"),
    visibility: z
        .enum(["private", "public"])
        .optional()
        .describe("public macht das Programm für alle sichtbar. Standard ist private."),
    segments: z
        .array(segmentSchema)
        .min(1)
        .describe("Die Blöcke in der Reihenfolge, in der sie gefahren werden. Höchstens 500, zusammen höchstens 8 Stunden."),
}

export type WorkoutInput = {
    name: string
    summary?: string
    tags?: string[]
    visibility?: "private" | "public"
    segments: Array<z.infer<typeof segmentSchema>>
}

/**
 * Die Zod-Form kennt nur `undefined`, das Drahtformat auch `null`. Ohne diese
 * Umrechnung landet bei einem Block ohne Rampe `targetEnd: undefined` im
 * JSON-Körper - also gar kein Feld, was die API zwar verträgt, aber der Server
 * bekommt dann bei einer Änderung nie mit, dass eine Rampe entfernt werden soll.
 */
export function toSaveWorkoutRequest(input: WorkoutInput, id?: string): SaveWorkoutRequest {
    const segments: WorkoutSegmentDTO[] = input.segments.map((segment) => ({
        title: segment.title ?? null,
        durationSeconds: segment.durationSeconds,
        target: segment.target,
        targetEnd: segment.targetEnd ?? null,
        cadenceLow: segment.cadenceLow ?? null,
        cadenceHigh: segment.cadenceHigh ?? null,
    }))

    return {
        ...(id !== undefined ? {id} : {}),
        name: input.name,
        summary: input.summary ?? "",
        tags: input.tags ?? [],
        visibility: input.visibility ?? "private",
        segments,
    }
}
