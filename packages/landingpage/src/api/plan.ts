import type {PlanEntryDTO, WorkoutDTO} from "@wattwerk/shared"
import {useCallback, useEffect, useRef, useState} from "react"
import {newID} from "../components/weekPlan"
import {api, ApiError} from "./client"

/**
 * Der Wochenplan als Zustand einer Seite.
 *
 * Jede Änderung schickt den ganzen Plan (`PUT /plan`) - so will es die API,
 * und bei einer Handvoll Zeilen ist das auch das Einfachste. Angezeigt wird
 * sofort; lehnt der Server ab, springt der Plan auf den letzten bestätigten
 * Stand zurück, und die Meldung steht daneben.
 *
 * Änderungen laufen der Reihe nach: wer schnell drei Tage anklickt, schickt
 * drei Pläne los, und überholt der erste den dritten, stünde auf dem Server
 * ein älterer Stand als auf dem Bildschirm.
 */
export function usePlan() {
    const [entries, setEntries] = useState<PlanEntryDTO[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const confirmed = useRef<PlanEntryDTO[]>([])
    const queue = useRef<Promise<void>>(Promise.resolve())

    useEffect(() => {
        let cancelled = false
        api.plan()
            .then((plan) => {
                if (cancelled) return
                confirmed.current = plan.entries
                setEntries(plan.entries)
            })
            .catch(() => {
                if (!cancelled) setError("Der Wochenplan konnte nicht geladen werden.")
            })
        return () => {
            cancelled = true
        }
    }, [])

    const save = useCallback((next: PlanEntryDTO[]) => {
        setEntries(next)
        setError(null)
        queue.current = queue.current.then(async () => {
            try {
                const saved = await api.savePlan({
                    entries: next.map((entry) => ({
                        id: entry.id,
                        weekday: entry.weekday,
                        workoutID: entry.workoutID,
                        workoutName: entry.workoutName,
                        sortIndex: entry.sortIndex,
                    })),
                })
                confirmed.current = saved.entries
                // Nur übernehmen, wenn inzwischen nichts Neueres unterwegs ist -
                // sonst flackert kurz der Zwischenstand auf.
                setEntries((current) => (current === next ? saved.entries : current))
            } catch (caught) {
                setEntries(confirmed.current)
                setError(caught instanceof ApiError ? caught.message : "Der Plan konnte nicht gespeichert werden.")
            }
        })
    }, [])

    const add = useCallback(
        (workout: WorkoutDTO, weekday: number) => {
            const current = entries ?? []
            const sortIndex = current.filter((entry) => entry.weekday === weekday).length
            save([
                ...current,
                {id: newID(), weekday, workoutID: workout.id, workoutName: workout.name, sortIndex, workout},
            ])
        },
        [entries, save]
    )

    const remove = useCallback(
        (id: string) => save((entries ?? []).filter((entry) => entry.id !== id)),
        [entries, save]
    )

    const move = useCallback(
        (id: string, weekday: number) => {
            const current = entries ?? []
            const sortIndex = current.filter((entry) => entry.weekday === weekday).length
            save(current.map((entry) => (entry.id === id ? {...entry, weekday, sortIndex} : entry)))
        },
        [entries, save]
    )

    return {entries, error, add, remove, move}
}
