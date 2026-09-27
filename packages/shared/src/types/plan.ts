import type {WorkoutDTO} from "./workout"

/**
 * Der Wochenplan: welches Programm an welchem Wochentag gefahren wird.
 *
 * Eine Vorlage, kein Kalender - "Dienstag: Sweet Spot" gilt jede Woche, bis
 * jemand den Plan ändert. Ein Kalender mit Daten bräuchte Serien, Ausnahmen
 * und eine Antwort auf die Frage, was mit einer verpassten Einheit passiert;
 * für "was fahre ich heute" reicht der Wochentag.
 *
 * Die App hält den Plan lokal und gleicht ihn nach der Anmeldung über die API
 * ab, damit ein auf dem Mac gebauter Plan auch auf dem Apple TV erscheint.
 */

/** Ein Eintrag im Wochenplan: an diesem Wochentag dieses Programm. */
export interface PlanEntryDTO {
    /** UUID, vom Gerät vergeben - wie bei Programmen, damit Anlegen und Abgleich derselbe Aufruf sind. */
    id: string
    /** ISO 8601: 1 = Montag … 7 = Sonntag. Nicht 0 = Sonntag wie in JavaScript. */
    weekday: number
    workoutID: string
    /** Name beim Einplanen - damit ein gelöschtes Programm im Plan noch erkennbar bleibt. */
    workoutName: string
    /** Reihenfolge innerhalb des Tages, für zwei Einheiten an einem Tag. */
    sortIndex: number
    /**
     * Das Programm selbst, sofern es für den Nutzer sichtbar ist (eigenes,
     * Katalog oder öffentliches); sonst `null`. Dann bleibt nur der Name - ein
     * gelöschtes oder wieder privat gestelltes fremdes Programm soll den Plan
     * nicht zerreißen, aber auch nicht über ihn lesbar werden.
     */
    workout: WorkoutDTO | null
}

export interface PlanResponse {
    /** Nach Wochentag, innerhalb des Tages nach `sortIndex`. */
    entries: PlanEntryDTO[]
}

export interface SavePlanEntryRequest {
    id: string
    weekday: number
    workoutID: string
    workoutName: string
    /** Fehlt es, zählt die Position unter den Einträgen desselben Tages. */
    sortIndex?: number
}

/**
 * Ersetzt den ganzen Plan auf einmal; eine leere Liste leert ihn.
 *
 * Absichtlich keine Routen je Eintrag: der Plan sind eine Handvoll Zeilen, und
 * einzelnes Anlegen und Löschen hieße, Löschungen über Geräte hinweg mit
 * Grabsteinen nachzuhalten - sonst taucht ein auf dem Mac entfernter Eintrag
 * beim nächsten Abgleich vom Apple TV wieder auf. Das Ganze zu schicken ist
 * kleiner als jede Buchführung darüber, was sich geändert hat.
 */
export interface SavePlanRequest {
    entries: SavePlanEntryRequest[]
}
