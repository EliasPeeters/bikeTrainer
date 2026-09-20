/**
 * Eine gefahrene Einheit, so wie die App sie aufzeichnet.
 *
 * Die Felder entsprechen `SessionRecord` aus `WattwerkCore`; die Sekundenspur
 * bleibt bewusst draussen. Sie waere pro Stunde ein paar hundert Kilobyte und
 * traegt fuer Verlauf und Wochenbelastung nichts bei - wenn sie einmal
 * gebraucht wird, bekommt sie eine eigene Tabelle.
 */
export interface TrainingSessionPayload {
    /** Kennung aus der App, damit ein zweiter Upload nicht doppelt anlegt. */
    clientID: string
    workoutName: string
    /** Kennung des gefahrenen Programms, falls es eins gab. */
    workoutID?: string | null
    /** ISO-8601 mit Zeitzone. */
    startedAt: string
    durationSeconds: number
    completed: boolean
    ftp: number
    averagePower: number
    maxPower: number
    normalizedPower: number
    intensityFactor: number
    trainingStressScore: number
    kilojoules: number
    averageCadence?: number | null
    averageHeartRate?: number | null
    maxHeartRate?: number | null
}

export interface TrainingSessionResponse extends TrainingSessionPayload {
    id: number
    createdAt: string
}

export interface TrainingSessionListResponse {
    sessions: TrainingSessionResponse[]
    /** Summe der Belastung der letzten sieben Tage - die Zahl, die zaehlt. */
    stressLastSevenDays: number
}
