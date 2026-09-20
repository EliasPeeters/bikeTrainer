/**
 * Das Drahtformat für Trainingsprogramme.
 *
 * Bewusst von Hand definiert und nicht aus Swifts `Codable` abgeleitet: Swift
 * kodiert Aufzählungen mit zugeordneten Werten als `{"steady":{"_0":…}}`, was
 * auf der TypeScript-Seite niemand lesen will und beim kleinsten Umbau am
 * Swift-Modell stillschweigend kippt. Hier steht das Format, beide Seiten
 * richten sich danach.
 */

export type WorkoutVisibility = "private" | "public"

export interface PowerTargetDTO {
    type: "watts" | "percentFTP" | "free"
    /**
     * Watt bei `watts`, Anteil der FTP bei `percentFTP` (0.9 heißt 90 %).
     * Fehlt bei `free` - dort gibt es keine Vorgabe.
     */
    value?: number
}

export interface WorkoutSegmentDTO {
    title?: string | null
    durationSeconds: number
    target: PowerTargetDTO
    /** Gesetzt heißt Rampe: linear von `target` nach `targetEnd`. */
    targetEnd?: PowerTargetDTO | null
    cadenceLow?: number | null
    cadenceHigh?: number | null
}

export interface WorkoutDTO {
    id: string
    name: string
    summary: string
    tags: string[]
    visibility: WorkoutVisibility
    segments: WorkoutSegmentDTO[]
    /** Abgeleitet aus den Segmenten, damit Listen nicht jedes Programm ausrechnen müssen. */
    durationSeconds: number
    /**
     * Geschätzte Belastung. Bei Zielen in Prozent der FTP ist sie unabhängig
     * von der FTP des Fahrers; nur bei Segmenten in absoluten Watt gilt sie für
     * die FTP dessen, der das Programm gespeichert hat.
     */
    plannedTSS: number
    /** Mitgelieferter Katalog - gehört niemandem und ist immer öffentlich. */
    isBuiltIn: boolean
    ownerUserID: number | null
    ownerName: string | null
    createdAt: string
    updatedAt: string
}

export interface SaveWorkoutRequest {
    /** Die App erzeugt die Kennung selbst, damit Anlegen und Abgleich derselbe Aufruf sind. */
    id?: string
    name: string
    summary?: string
    tags?: string[]
    visibility?: WorkoutVisibility
    segments: WorkoutSegmentDTO[]
    plannedTSS?: number
}

export interface WorkoutListResponse {
    workouts: WorkoutDTO[]
}

/**
 * Was die App beim Anmelden hochschiebt: alles, was lokal entstanden ist,
 * während niemand angemeldet war.
 */
export interface WorkoutSyncRequest {
    workouts: SaveWorkoutRequest[]
}
