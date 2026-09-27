import type {SavePlanEntryRequest, SavePlanRequest} from "@wattwerk/shared"
import {isUUID} from "./Validation"

/**
 * Sieben Tage, ein paar Einheiten je Tag. Was darüber liegt, ist ein Fehler
 * in der App oder jemand, der die Tabelle als Ablage missbraucht.
 */
export const MAX_PLAN_ENTRIES = 50

/** So lang wie der Name eines Programms. */
export const MAX_PLAN_WORKOUT_NAME_LENGTH = 200

/** Die Obergrenze von `INT(11)` - darüber scheitert erst die Datenbank. */
const MAX_SORT_INDEX = 2_147_483_647

export interface ValidPlanEntry {
    id: string
    weekday: number
    workoutID: string
    workoutName: string
    sortIndex: number
}

/**
 * `string` ist der Grund für die Ablehnung, sonst die geprüften Einträge.
 *
 * Ein einziger unbrauchbarer Eintrag lehnt den ganzen Plan ab, statt ihn
 * auszulassen: der Plan wird als Ganzes ersetzt, und ein stillschweigend
 * fehlender Eintrag wäre nach dem nächsten Abgleich auf allen Geräten weg.
 *
 * Ob es das Programm gibt, wird hier bewusst nicht geprüft - eingeplant werden
 * darf auch ein mitgeliefertes oder eines, das im selben Abgleich erst
 * hochgeladen wird.
 */
export function validatePlan(body: SavePlanRequest | null | undefined): ValidPlanEntry[] | string {
    if (body === null || body === undefined || typeof body !== "object") {
        return "Der Anfragekörper fehlt."
    }
    if (!Array.isArray(body.entries)) {
        return "entries fehlt."
    }
    if (body.entries.length > MAX_PLAN_ENTRIES) {
        return `Mehr als ${MAX_PLAN_ENTRIES} Einträge im Wochenplan sind nicht vorgesehen.`
    }

    const entries: ValidPlanEntry[] = []
    const seenIDs = new Set<string>()
    // Position je Wochentag, für Einträge ohne eigenen sortIndex.
    const positionInDay = new Map<number, number>()

    for (const [index, raw] of body.entries.entries()) {
        const entry = validateEntry(raw, index)
        if (typeof entry === "string") {
            return entry
        }
        // Die Kennung ist der Primärschlüssel. Doppelt im selben Plan hieße,
        // dass der zweite Eintrag den ersten beim Einfügen sprengt.
        if (seenIDs.has(entry.id)) {
            return `Eintrag ${index + 1}: die Kennung kommt im Plan doppelt vor.`
        }
        seenIDs.add(entry.id)

        const position = positionInDay.get(entry.weekday) ?? 0
        positionInDay.set(entry.weekday, position + 1)

        entries.push({
            id: entry.id,
            weekday: entry.weekday,
            workoutID: entry.workoutID,
            workoutName: entry.workoutName,
            sortIndex: entry.sortIndex ?? position,
        })
    }

    return entries
}

function validateEntry(raw: unknown, index: number): (Omit<ValidPlanEntry, "sortIndex"> & {sortIndex?: number}) | string {
    if (raw === null || typeof raw !== "object") {
        return `Eintrag ${index + 1} ist unbrauchbar.`
    }
    const entry = raw as SavePlanEntryRequest

    if (!isUUID(entry.id)) {
        return `Eintrag ${index + 1} braucht eine Kennung im UUID-Format.`
    }
    if (!isUUID(entry.workoutID)) {
        return `Eintrag ${index + 1} braucht eine Programmkennung im UUID-Format.`
    }
    // Ganze Zahl und nicht gerundet: 1.5 ist kein Wochentag, sondern ein
    // Fehler in der App, und den soll sie sehen.
    if (typeof entry.weekday !== "number" || !Number.isInteger(entry.weekday) || entry.weekday < 1 || entry.weekday > 7) {
        return `Eintrag ${index + 1}: der Wochentag muss zwischen 1 (Montag) und 7 (Sonntag) liegen.`
    }
    if (typeof entry.workoutName !== "string") {
        return `Eintrag ${index + 1} braucht den Namen des Programms.`
    }

    let sortIndex: number | undefined
    if (entry.sortIndex !== undefined && entry.sortIndex !== null) {
        if (
            typeof entry.sortIndex !== "number" ||
            !Number.isInteger(entry.sortIndex) ||
            entry.sortIndex < 0 ||
            entry.sortIndex > MAX_SORT_INDEX
        ) {
            return `Eintrag ${index + 1}: die Reihenfolge muss eine ganze Zahl ab 0 sein.`
        }
        sortIndex = entry.sortIndex
    }

    return {
        id: entry.id.toLowerCase(),
        weekday: entry.weekday,
        workoutID: entry.workoutID.toLowerCase(),
        workoutName: entry.workoutName.trim().slice(0, MAX_PLAN_WORKOUT_NAME_LENGTH),
        sortIndex,
    }
}
