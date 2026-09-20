import type {PowerTargetDTO, SaveWorkoutRequest, WorkoutSegmentDTO, WorkoutVisibility} from "@wattwerk/shared"

export const MAX_SEGMENTS = 500
export const MAX_SEGMENT_SECONDS = 4 * 3600
export const MAX_WORKOUT_SECONDS = 8 * 3600

export interface ValidWorkoutInput {
    name: string
    summary: string
    tags: string[]
    visibility: WorkoutVisibility
    segments: WorkoutSegmentDTO[]
}

/** `string` ist der Grund für die Ablehnung, sonst das geprüfte Programm. */
export function validateWorkout(body: SaveWorkoutRequest | null | undefined): ValidWorkoutInput | string {
    if (body === null || body === undefined || typeof body !== "object") {
        return "Der Anfragekörper fehlt."
    }
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return "Das Programm braucht einen Namen."
    }
    if (!Array.isArray(body.segments) || body.segments.length === 0) {
        return "Das Programm braucht mindestens einen Block."
    }
    if (body.segments.length > MAX_SEGMENTS) {
        return `Mehr als ${MAX_SEGMENTS} Blöcke sind nicht vorgesehen.`
    }

    const segments: WorkoutSegmentDTO[] = []
    let total = 0
    for (const [index, raw] of body.segments.entries()) {
        const segment = validateSegment(raw, index)
        if (typeof segment === "string") {
            return segment
        }
        total += segment.durationSeconds
        segments.push(segment)
    }
    if (total > MAX_WORKOUT_SECONDS) {
        return "Das Programm ist länger als acht Stunden."
    }

    const visibility: WorkoutVisibility = body.visibility === "public" ? "public" : "private"
    const tags = Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
              .map((tag) => tag.trim().slice(0, 40))
              .slice(0, 10)
        : []

    return {
        name: body.name.trim().slice(0, 200),
        summary: typeof body.summary === "string" ? body.summary.trim().slice(0, 500) : "",
        tags,
        visibility,
        segments,
    }
}

function validateSegment(raw: unknown, index: number): WorkoutSegmentDTO | string {
    if (raw === null || typeof raw !== "object") {
        return `Block ${index + 1} ist unbrauchbar.`
    }
    const segment = raw as WorkoutSegmentDTO

    const duration = segment.durationSeconds
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 1) {
        return `Block ${index + 1} braucht eine Dauer.`
    }
    if (duration > MAX_SEGMENT_SECONDS) {
        return `Block ${index + 1} ist länger als vier Stunden.`
    }

    const target = validateTarget(segment.target, index)
    if (typeof target === "string") {
        return target
    }

    let targetEnd: PowerTargetDTO | null = null
    if (segment.targetEnd !== null && segment.targetEnd !== undefined) {
        const parsed = validateTarget(segment.targetEnd, index)
        if (typeof parsed === "string") {
            return parsed
        }
        targetEnd = parsed
    }

    // Trittfrequenz nur übernehmen, wenn beide Grenzen da sind und in der
    // richtigen Reihenfolge stehen - eine halbe Angabe ist keine Vorgabe.
    let cadenceLow: number | null = null
    let cadenceHigh: number | null = null
    if (typeof segment.cadenceLow === "number" && typeof segment.cadenceHigh === "number") {
        const low = Math.round(segment.cadenceLow)
        const high = Math.round(segment.cadenceHigh)
        if (low >= 20 && high <= 200 && low <= high) {
            cadenceLow = low
            cadenceHigh = high
        }
    }

    return {
        title: typeof segment.title === "string" && segment.title.trim().length > 0
            ? segment.title.trim().slice(0, 120)
            : null,
        durationSeconds: Math.round(duration),
        target,
        targetEnd,
        cadenceLow,
        cadenceHigh,
    }
}

function validateTarget(raw: unknown, index: number): PowerTargetDTO | string {
    if (raw === null || typeof raw !== "object") {
        return `Block ${index + 1} braucht ein Ziel.`
    }
    const target = raw as PowerTargetDTO
    switch (target.type) {
        case "free":
            return {type: "free"}
        case "watts": {
            const value = target.value
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2000) {
                return `Block ${index + 1}: Wattzahl außerhalb des erlaubten Bereichs.`
            }
            return {type: "watts", value: Math.round(value)}
        }
        case "percentFTP": {
            const value = target.value
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 4) {
                return `Block ${index + 1}: Anteil der FTP außerhalb des erlaubten Bereichs.`
            }
            return {type: "percentFTP", value}
        }
        default:
            return `Block ${index + 1}: unbekannter Zieltyp.`
    }
}
