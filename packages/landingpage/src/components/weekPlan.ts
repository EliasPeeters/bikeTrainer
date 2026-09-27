import type {PlanEntryDTO, TrainingSessionResponse} from "@wattwerk/shared"

/**
 * Rechnen mit Wochen, genauso wie die App es tut.
 *
 * Die Woche beginnt am Montag, die Wochentage zählen nach ISO 8601
 * (1 = Montag … 7 = Sonntag) - dieselbe Zahl, die auf dem Draht steht.
 * Gerechnet wird in der Zeitzone des Browsers: „Dienstag“ ist der Dienstag
 * dessen, der vor dem Bildschirm sitzt.
 */

export const WEEKDAYS = [
    {day: 1, name: "Montag", short: "Mo"},
    {day: 2, name: "Dienstag", short: "Di"},
    {day: 3, name: "Mittwoch", short: "Mi"},
    {day: 4, name: "Donnerstag", short: "Do"},
    {day: 5, name: "Freitag", short: "Fr"},
    {day: 6, name: "Samstag", short: "Sa"},
    {day: 7, name: "Sonntag", short: "So"},
] as const

export function weekdayName(day: number): string {
    return WEEKDAYS.find((entry) => entry.day === day)?.name ?? ""
}

/** ISO-Wochentag eines Datums: 1 = Montag … 7 = Sonntag. */
export function isoWeekday(date: Date): number {
    return ((date.getDay() + 6) % 7) + 1
}

export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Über den Kalender, nicht über 24 Stunden: an den beiden Tagen der
 * Zeitumstellung hat ein Tag 23 oder 25 Stunden, und `+ 86400000` landete
 * dann um 23 Uhr am Vortag.
 */
export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Montag, 0 Uhr, der Woche, in der `date` liegt. */
export function startOfWeek(date: Date): Date {
    const day = startOfDay(date)
    return addDays(day, -(isoWeekday(day) - 1))
}

/** Kalenderwoche nach ISO 8601 - die, die in deutschen Kalendern steht. */
export function isoWeekNumber(monday: Date): number {
    const thursday = addDays(monday, 3)
    const firstThursday = new Date(thursday.getFullYear(), 0, 4)
    const firstMonday = startOfWeek(firstThursday)
    return Math.round((thursday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1
}

/** `2026-09-28` - für die Adresse, damit sich eine Woche verlinken lässt. */
export function toDateParam(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

export function fromDateParam(value: string | null): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
    if (match === null) {
        return null
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Number.isNaN(date.getTime()) ? null : date
}

export function weeksBetween(from: Date, to: Date): number {
    return Math.round((startOfWeek(to).getTime() - startOfWeek(from).getTime()) / (7 * 86_400_000))
}

/** „Diese Woche“, „Nächste Woche“, „Vor 3 Wochen“ … */
export function relativeWeekLabel(offset: number): string {
    if (offset === 0) return "Diese Woche"
    if (offset === 1) return "Nächste Woche"
    if (offset === -1) return "Letzte Woche"
    return offset > 0 ? `In ${offset} Wochen` : `Vor ${-offset} Wochen`
}

export function formatDayMonth(date: Date): string {
    return date.toLocaleDateString("de-DE", {day: "numeric", month: "short"})
}

export interface PlanDay {
    day: number
    date: Date
    entries: PlanEntryDTO[]
    /** Einheiten dieses Tages, die keinen Eintrag abgehakt haben. */
    extraSessions: TrainingSessionResponse[]
    isToday: boolean
    isPast: boolean
}

export interface PlanWeek {
    days: PlanDay[]
    /** Eintrag-ID → die Einheit, die ihn abgehakt hat. */
    completedBy: Map<string, TrainingSessionResponse>
}

/**
 * Die sieben Tage einer Woche mit dem, was gefahren wurde.
 *
 * Dieselbe Regel wie in der App (`TrainingWeek.days`): eine Einheit hakt einen
 * Eintrag ab, wenn sie dasselbe Programm war - zuerst am selben Tag, danach
 * irgendwo in derselben Woche, weil der Dienstag oft ein Mittwoch wird. Jede
 * Einheit hakt höchstens einen Eintrag ab.
 */
export function buildWeek(
    monday: Date,
    entries: PlanEntryDTO[],
    sessions: TrainingSessionResponse[],
    now = new Date()
): PlanWeek {
    const today = startOfDay(now)
    const dates = WEEKDAYS.map(({day}) => addDays(monday, day - 1))
    const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === b.getTime()

    const unused = sessions
        .filter((session) => session.workoutID)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    const completedBy = new Map<string, TrainingSessionResponse>()

    const ordered = [...entries].sort((a, b) => a.weekday - b.weekday || a.sortIndex - b.sortIndex)
    const consume = (entry: PlanEntryDTO, matches: (session: TrainingSessionResponse) => boolean) => {
        if (completedBy.has(entry.id)) return
        const index = unused.findIndex(
            (session) => session.workoutID?.toLowerCase() === entry.workoutID.toLowerCase() && matches(session)
        )
        if (index < 0) return
        completedBy.set(entry.id, unused[index])
        unused.splice(index, 1)
    }
    for (const entry of ordered) {
        consume(entry, (session) => sameDay(new Date(session.startedAt), dates[entry.weekday - 1]))
    }
    for (const entry of ordered) {
        consume(entry, () => true)
    }

    const consumed = new Set([...completedBy.values()].map((session) => session.id))
    const days = WEEKDAYS.map(({day}, index) => {
        const date = dates[index]
        return {
            day,
            date,
            entries: ordered.filter((entry) => entry.weekday === day),
            extraSessions: sessions
                .filter((session) => !consumed.has(session.id) && sameDay(new Date(session.startedAt), date))
                .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
            isToday: date.getTime() === today.getTime(),
            isPast: date.getTime() < today.getTime(),
        }
    })
    return {days, completedBy}
}

/** `crypto.randomUUID` gibt es nur in sicheren Kontexten - im LAN über http nicht. */
export function newID(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = (Math.random() * 16) | 0
        return (character === "x" ? random : (random & 0x3) | 0x8).toString(16)
    })
}
