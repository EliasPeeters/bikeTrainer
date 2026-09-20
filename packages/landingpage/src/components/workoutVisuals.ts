import type {PowerTargetDTO, WorkoutSegmentDTO} from "@wattwerk/shared"

/**
 * Bezugs-FTP für die Darstellung. Dieselbe wie auf dem Server: bei Zielen in
 * Prozent der FTP kürzt sie sich heraus, das Bild stimmt also für jeden.
 */
export const REFERENCE_FTP = 200

export function targetWatts(target: PowerTargetDTO | null | undefined): number | null {
    if (!target) {
        return null
    }
    if (target.type === "watts") {
        return Math.max(0, Math.round(target.value ?? 0))
    }
    if (target.type === "percentFTP") {
        return Math.max(0, Math.round(REFERENCE_FTP * (target.value ?? 0)))
    }
    return null
}

/** Dieselben sieben Zonen wie in der App. */
export function zoneColor(watts: number | null): string {
    if (watts === null) {
        return "#5a6376"
    }
    const fraction = watts / REFERENCE_FTP
    if (fraction < 0.56) return "#737f94"
    if (fraction < 0.76) return "#548eed"
    if (fraction < 0.91) return "#3dc28c"
    if (fraction < 1.06) return "#f2c738"
    if (fraction < 1.21) return "#f78c2e"
    if (fraction < 1.51) return "#eb4f45"
    return "#b85aeb"
}

export interface ProfileBlock {
    x: number
    width: number
    startHeight: number
    endHeight: number
    color: string
    free: boolean
}

/**
 * Rechnet die Blöcke in Anteile von Breite und Höhe um - die Zeichenfläche
 * selbst kennt keine Wattzahlen, sondern nur Prozente.
 */
export function profileBlocks(segments: WorkoutSegmentDTO[]): ProfileBlock[] {
    const total = segments.reduce((sum, segment) => sum + Math.max(1, segment.durationSeconds), 0)
    if (total <= 0) {
        return []
    }

    const peak = segments.reduce((max, segment) => {
        const start = targetWatts(segment.target) ?? 0
        const end = targetWatts(segment.targetEnd ?? segment.target) ?? 0
        return Math.max(max, start, end)
    }, 0)
    // Kopfraum, damit der höchste Block nicht am oberen Rand klebt.
    const ceiling = Math.max(peak * 1.12, REFERENCE_FTP * 1.2)

    let offset = 0
    return segments.map((segment) => {
        const duration = Math.max(1, segment.durationSeconds)
        const start = targetWatts(segment.target)
        const end = targetWatts(segment.targetEnd ?? segment.target)
        const block: ProfileBlock = {
            x: (offset / total) * 100,
            width: (duration / total) * 100,
            // Freie Blöcke bekommen eine niedrige, graue Fläche - sie haben
            // keine Vorgabe, sollen aber sichtbar bleiben.
            startHeight: start === null ? 18 : (start / ceiling) * 100,
            endHeight: end === null ? 18 : (end / ceiling) * 100,
            color: zoneColor(start ?? end),
            free: start === null && end === null,
        }
        offset += duration
        return block
    })
}

export function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    if (total < 60) {
        return `${total} s`
    }
    const minutes = Math.round(total / 60)
    if (minutes < 60) {
        return `${minutes} min`
    }
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest === 0 ? `${hours} h` : `${hours}:${String(rest).padStart(2, "0")} h`
}

export function formatClock(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const rest = total % 60
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    }
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

export function formatDate(iso: string): string {
    const date = new Date(iso)
    return date.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    })
}
