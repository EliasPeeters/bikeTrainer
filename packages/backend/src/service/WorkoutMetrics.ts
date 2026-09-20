import type {PowerTargetDTO, WorkoutSegmentDTO} from "@wattwerk/shared"

/**
 * Dauer und geschätzte Belastung eines Programms - auf dem Server gerechnet,
 * nicht vom Client übernommen.
 *
 * Sonst hinge die Sortierung der Entdecken-Seite davon ab, was ein Client
 * mitschickt, und zwei Clients mit verschiedenen Fassungen der Rechnung
 * lieferten verschiedene Zahlen für dasselbe Programm.
 */

/**
 * Bezugs-FTP für die Belastungsschätzung.
 *
 * Bei Zielen in Prozent der FTP kürzt sie sich heraus - die Zahl gilt dann für
 * jeden. Nur Segmente in absoluten Watt werden gegen diesen Wert gerechnet,
 * was für ein Programm, das fremde Leute sehen, die ehrlichere Wahl ist als
 * die FTP dessen, der es gespeichert hat.
 */
export const REFERENCE_FTP = 200

export interface WorkoutMetrics {
    durationSeconds: number
    plannedTSS: number
}

function watts(target: PowerTargetDTO | null | undefined): number | null {
    if (target === null || target === undefined) {
        return null
    }
    switch (target.type) {
        case "watts":
            return Math.max(0, Math.round(target.value ?? 0))
        case "percentFTP":
            return Math.max(0, Math.round(REFERENCE_FTP * (target.value ?? 0)))
        default:
            return null
    }
}

function averageWatts(segment: WorkoutSegmentDTO): number | null {
    const start = watts(segment.target)
    const end = watts(segment.targetEnd ?? segment.target)
    if (start === null && end === null) {
        return null
    }
    if (start === null) {
        return end
    }
    if (end === null) {
        return start
    }
    return Math.round((start + end) / 2)
}

export function workoutMetrics(segments: WorkoutSegmentDTO[]): WorkoutMetrics {
    const durationSeconds = segments.reduce((sum, segment) => sum + Math.max(1, Math.round(segment.durationSeconds)), 0)
    if (durationSeconds <= 0) {
        return {durationSeconds: 0, plannedTSS: 0}
    }

    // Vierte Potenz gewichtet die harten Abschnitte, wie es die normalisierte
    // Leistung tut - dieselbe Rechnung wie in WattwerkCore.
    let weighted = 0
    for (const segment of segments) {
        const average = averageWatts(segment)
        if (average === null) {
            continue
        }
        weighted += Math.pow(average, 4) * Math.max(1, Math.round(segment.durationSeconds))
    }
    if (weighted <= 0) {
        return {durationSeconds, plannedTSS: 0}
    }

    const normalized = Math.pow(weighted / durationSeconds, 0.25)
    const intensityFactor = normalized / REFERENCE_FTP
    const tss = (durationSeconds * normalized * intensityFactor) / (REFERENCE_FTP * 3600) * 100
    return {durationSeconds, plannedTSS: Math.round(tss)}
}
