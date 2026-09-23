import type {RideTrackDTO} from "@wattwerk/shared"

export type RideMetricKey = "power" | "heartRate" | "cadence" | "speed"

export interface RideMetric {
    key: RideMetricKey
    label: string
    unit: string
    color: string
    /** Nachkommastellen in der Beschriftung. */
    decimals: number
}

/**
 * Die Messgrößen einer Fahrt, in der Reihenfolge, in der sie gezeichnet werden.
 *
 * Leistung zuerst: sie ist die unruhigste Kurve und liegt deshalb unten, damit
 * Puls und Trittfrequenz nicht von ihr zerschnitten werden. Die Farben sind
 * dieselben wie in der App - wer beide nebeneinander benutzt, soll nicht
 * umlernen müssen.
 */
export const RIDE_METRICS: RideMetric[] = [
    {key: "power", label: "Leistung", unit: "W", color: "#4e95f8", decimals: 0},
    {key: "heartRate", label: "Puls", unit: "bpm", color: "#f24d66", decimals: 0},
    {key: "cadence", label: "Trittfrequenz", unit: "U/min", color: "#b07cf0", decimals: 0},
    {key: "speed", label: "Tempo", unit: "km/h", color: "#4ccb7a", decimals: 1},
]

/** Die Werte einer Größe. `null` heißt: an dieser Sekunde nichts gemessen. */
export function metricValues(track: RideTrackDTO, key: RideMetricKey): (number | null)[] {
    if (key === "power") {
        return track.power
    }
    return track[key] ?? []
}

/**
 * Ob es diese Größe in dieser Fahrt überhaupt gibt.
 *
 * Eine Spalte voller Nullen zählt nicht: ein Trainer ohne Geschwindigkeitswert
 * meldet oft 0 statt gar nichts, und daraus eine Kurve zu zeichnen wäre eine
 * Behauptung über eine Messung, die nie stattgefunden hat.
 */
export function hasMetric(track: RideTrackDTO, key: RideMetricKey): boolean {
    const values = metricValues(track, key)
    return values.some((value) => value !== null && value > 0)
}

export interface MetricSummary {
    min: number
    max: number
    average: number
}

/** Kleinster, größter und mittlerer Wert - über alles, was gemessen wurde. */
export function summarize(track: RideTrackDTO, key: RideMetricKey): MetricSummary | null {
    const values = metricValues(track, key).filter(
        (value): value is number => value !== null && value > 0
    )
    if (values.length === 0) {
        return null
    }
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
    }
}

/**
 * Ober- und Untergrenze der Achse.
 *
 * Leistung beginnt bei null, sonst sieht jede Pause aus wie ein Einbruch.
 * Puls und Trittfrequenz spielen sich in einem engen Band ab - eine Achse ab
 * null machte daraus eine flache Linie am oberen Rand.
 */
export function metricScale(
    track: RideTrackDTO,
    key: RideMetricKey,
    ftp: number
): {lower: number; upper: number} {
    const summary = summarize(track, key)
    if (summary === null) {
        return {lower: 0, upper: 1}
    }
    if (key === "power") {
        return {lower: 0, upper: Math.max(summary.max * 1.1, ftp * 1.2)}
    }
    const padding = Math.max(5, (summary.max - summary.min) * 0.15)
    return {lower: Math.max(0, summary.min - padding), upper: summary.max + padding}
}

/**
 * Dünnt die Spur auf höchstens `maxPoints` Punkte aus.
 *
 * Mittelwert je Eimer statt jeder n-te Wert: sonst hinge das Bild davon ab,
 * welche Sekunde zufällig auf das Raster fällt. Ein Eimer ohne einen einzigen
 * Messwert bleibt `null` und reißt die Kurve auf - genau richtig, denn dort
 * war wirklich nichts.
 */
export function reduce(values: (number | null)[], maxPoints: number): (number | null)[] {
    if (values.length <= maxPoints) {
        return values
    }
    const bucket = Math.ceil(values.length / maxPoints)
    const out: (number | null)[] = []
    for (let start = 0; start < values.length; start += bucket) {
        const slice = values
            .slice(start, start + bucket)
            .filter((value): value is number => value !== null)
        out.push(slice.length === 0 ? null : slice.reduce((sum, value) => sum + value, 0) / slice.length)
    }
    return out
}

export function formatMetric(value: number, metric: RideMetric): string {
    return value.toFixed(metric.decimals)
}
