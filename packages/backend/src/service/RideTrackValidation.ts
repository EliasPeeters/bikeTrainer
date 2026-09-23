import type {RideTrackDTO} from "@wattwerk/shared"
import type {TrackChannels} from "../db/DBTrainingSessionTrack"

/**
 * Obergrenze für die Länge einer Spur.
 *
 * 24 Stunden im Sekundentakt - dieselbe Grenze, die `durationSeconds` schon
 * hat. Sie steht nicht da, weil jemand so lange fährt, sondern weil ohne sie
 * ein einziger Aufruf beliebig viel Speicher belegen kann.
 */
export const MAX_TRACK_SAMPLES = 24 * 3600

/**
 * Was eine Spalte hergeben darf, und mit wie vielen Nachkommastellen.
 *
 * Alles darüber ist ein Messfehler. Mehr als eine Nachkommastelle gibt kein
 * Sensor her, kostet aber Platz in jeder Sekunde der Fahrt.
 */
const LIMITS: Record<string, {max: number; decimals: number}> = {
    power: {max: 3000, decimals: 0},
    targetPower: {max: 3000, decimals: 0},
    cadence: {max: 250, decimals: 0},
    heartRate: {max: 260, decimals: 0},
    speed: {max: 150, decimals: 1},
}

export interface NormalizedTrack {
    sampleIntervalSeconds: number
    sampleCount: number
    startOffsetSeconds: number
    channels: TrackChannels
}

export type TrackValidation =
    | {ok: true; track: NormalizedTrack}
    | {ok: false; problem: string}

/**
 * Prüft und bereinigt eine hochgeladene Spur.
 *
 * Bereinigt, nicht nur geprüft: ein Pulsgurt, der kurz 0 meldet, und ein
 * Trainer, der beim Antreten 4000 W behauptet, sollen die Einheit nicht
 * kosten. Unbrauchbare einzelne Werte werden zu `null` - das ist genau die
 * Aussage "hier war nichts Verlässliches". Nur was strukturell nicht passt,
 * wird abgelehnt.
 */
export function validateTrack(raw: unknown, durationSeconds: number): TrackValidation {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {ok: false, problem: "track ist kein Objekt."}
    }
    const track = raw as Partial<RideTrackDTO>

    const interval = track.sampleIntervalSeconds ?? 1
    if (!Number.isFinite(interval) || interval < 1 || interval > 3600) {
        return {ok: false, problem: "track.sampleIntervalSeconds ist unbrauchbar."}
    }

    const startOffset = track.startOffsetSeconds ?? 0
    if (!Number.isFinite(startOffset) || startOffset < 0 || startOffset > MAX_TRACK_SAMPLES) {
        return {ok: false, problem: "track.startOffsetSeconds ist unbrauchbar."}
    }

    if (!Array.isArray(track.power)) {
        return {ok: false, problem: "track.power fehlt."}
    }
    const sampleCount = track.power.length
    if (sampleCount === 0) {
        return {ok: false, problem: "track.power ist leer."}
    }
    if (sampleCount > MAX_TRACK_SAMPLES) {
        return {ok: false, problem: "track ist zu lang."}
    }

    // Die Spur darf nicht länger sein als die Fahrt. Grosszügig, weil die App
    // die Dauer rundet und der letzte Punkt auf der Sekunde des Endes liegt -
    // aber eng genug, dass eine Spur, die zur Einheit nicht gehört, auffällt.
    const covered = startOffset + sampleCount * Math.round(interval)
    if (covered > Math.max(60, Math.round(durationSeconds) * 1.05 + 60)) {
        return {ok: false, problem: "track ist länger als die Einheit."}
    }

    const channels: TrackChannels = {
        power: track.power.map((value) => clamp(value, LIMITS.power) ?? 0),
    }


    for (const name of ["targetPower", "cadence", "heartRate", "speed"] as const) {
        const column = track[name]
        if (column === undefined || column === null) {
            continue
        }
        if (!Array.isArray(column)) {
            return {ok: false, problem: `track.${name} ist kein Feld.`}
        }
        if (column.length !== sampleCount) {
            // Ungleich lange Spalten liessen sich auffüllen - aber dann stünde
            // der Puls ab irgendeiner Stelle neben der falschen Sekunde, und
            // das sähe aus wie eine echte Messung.
            return {ok: false, problem: `track.${name} hat eine andere Länge als track.power.`}
        }
        const cleaned = column.map((value) => clamp(value, LIMITS[name]))
        // Eine Spalte, in der nichts Brauchbares steht, wird nicht gespeichert:
        // sonst zeigt die Oberfläche eine leere Kurve statt gar keiner.
        if (cleaned.some((value) => value !== null)) {
            channels[name] = cleaned
        }
    }

    return {
        ok: true,
        track: {
            sampleIntervalSeconds: Math.round(interval),
            sampleCount,
            startOffsetSeconds: Math.round(startOffset),
            channels,
        },
    }
}

/** Gerundet und begrenzt, oder `null`, wenn der Wert nichts aussagt. */
function clamp(value: unknown, limit: {max: number; decimals: number}): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > limit.max) {
        return null
    }
    const factor = 10 ** limit.decimals
    return Math.round(value * factor) / factor
}
