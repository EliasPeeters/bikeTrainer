import type {WorkoutDTO, WorkoutVisibility} from "./workout"

/**
 * Eine Sammlung ist Ordner und Playlist in einem.
 *
 * Getrennte Begriffe für dasselbe Ding wären zwei Datenmodelle, zwei
 * Oberflächen und die Frage, warum ein Programm nicht in beidem liegen darf.
 * Eine Sammlung hat eine Reihenfolge - wer sie als Playlist benutzt, fährt sie
 * der Reihe nach; wer sie als Ordner benutzt, ignoriert die Reihenfolge.
 */
export interface CollectionDTO {
    id: string
    name: string
    summary: string
    visibility: WorkoutVisibility
    ownerUserID: number
    ownerName: string | null
    /** In der Reihenfolge, in der sie in der Sammlung stehen. */
    workouts: WorkoutDTO[]
    createdAt: string
    updatedAt: string
}

export interface SaveCollectionRequest {
    id?: string
    name: string
    summary?: string
    visibility?: WorkoutVisibility
    /** Ersetzt den Inhalt vollständig, wenn gesetzt. */
    workoutIDs?: string[]
}

export interface CollectionListResponse {
    collections: CollectionDTO[]
}

export interface AddToCollectionRequest {
    workoutID: string
}
