/**
 * Eine gefahrene Einheit, so wie die App sie aufzeichnet.
 *
 * Die Felder entsprechen `SessionRecord` aus `WattwerkCore`. Die Sekundenspur
 * haengt als `track` daran, wird aber nie mit der Liste ausgeliefert - sie ist
 * pro Stunde ein paar hundert Kilobyte, und der Verlauf zeigt Kacheln, keine
 * Kurven. Wer die Kurve braucht, holt sie einzeln ueber `/sessions/:id/track`.
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
    /**
     * Der Sekundenverlauf, soweit das Geraet ihn hat.
     *
     * Optional, und das bleibt so: Version 1.0 der App kennt das Feld nicht,
     * und auf dem Apple TV geht eine Spur verloren, wenn die Einheit erst
     * spaeter hochgeht. Fehlt das Feld bei einem zweiten Upload derselben
     * Einheit, bleibt eine bereits gespeicherte Spur stehen - sonst loeschte
     * ein Nachtrag vom Fernseher die Kurve vom Mac.
     */
    track?: RideTrackDTO | null
}

/**
 * Der Sekundenverlauf einer Einheit, spaltenweise.
 *
 * Nicht als Liste von Punkten, sondern ein Feld je Messgroesse: dieselbe Fahrt
 * ist so rund ein Drittel so gross, weil die Feldnamen nur einmal vorkommen
 * statt einmal pro Sekunde. Alle vorhandenen Spalten sind gleich lang
 * (`sampleCount`); `null` an einer Stelle heisst "kein Messwert", etwa weil der
 * Pulsgurt kurz weg war. Eine Messgroesse, die es die ganze Fahrt ueber nicht
 * gab, fehlt ganz - ein Feld voller `null` traegt nichts.
 */
export interface RideTrackDTO {
    /** Abstand zweier Punkte. Heute immer 1; das Feld haelt die Tuer offen. */
    sampleIntervalSeconds: number
    /** Anzahl der Punkte je vorhandener Spalte. */
    sampleCount: number
    /** Sekunde des ersten Punktes, gemessen ab Start der Einheit. */
    startOffsetSeconds: number
    /** Watt. Die einzige Spalte, die immer da ist - ohne sie gibt es keine Spur. */
    power: number[]
    /** Die an den Trainer geschickte Vorgabe, Watt. */
    targetPower?: (number | null)[]
    /** Umdrehungen pro Minute. */
    cadence?: (number | null)[]
    /** Schlaege pro Minute. */
    heartRate?: (number | null)[]
    /** km/h, wie der Trainer sie meldet. */
    speed?: (number | null)[]
}

export interface TrainingSessionResponse extends Omit<TrainingSessionPayload, "track"> {
    id: number
    createdAt: string
    /**
     * Ob zu dieser Einheit eine Sekundenspur liegt. Die Liste laedt sie nicht
     * mit; die Oberflaeche braucht aber vorher die Antwort, ob sich ein Klick
     * auf die Kurve lohnt. Bei Einheiten aus Version 1.0 immer `false`.
     */
    hasTrack: boolean
}

export interface RideTrackResponse {
    /** Die Einheit, zu der die Spur gehoert. */
    sessionID: number
    track: RideTrackDTO
}

export interface TrainingSessionListResponse {
    sessions: TrainingSessionResponse[]
    /** Summe der Belastung der letzten sieben Tage - die Zahl, die zaehlt. */
    stressLastSevenDays: number
}
