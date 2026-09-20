import type {CollectionDTO} from "./collection"
import type {WorkoutDTO} from "./workout"

/**
 * Die Startseite der Bibliothek: Reihen von Programmen, wie man es von
 * Streaming-Diensten kennt.
 *
 * Der Server entscheidet, welche Reihen es gibt und wie sie heißen. Damit
 * lassen sich Empfehlungen ändern, ohne App und Web-Portal neu auszuliefern -
 * beide zeichnen nur, was kommt.
 */
export interface DiscoveryRow {
    key: string
    title: string
    subtitle?: string
    workouts: WorkoutDTO[]
}

export interface DiscoveryResponse {
    rows: DiscoveryRow[]
    /** Eigene Sammlungen, für die Reihe "Deine Ordner". */
    collections: CollectionDTO[]
}

export interface WorkoutSearchQuery {
    query?: string
    tag?: string
    maxDurationSeconds?: number
    minDurationSeconds?: number
    limit?: number
}
