import type {WorkoutDTO} from "@wattwerk/shared"
import {useEffect, useMemo, useRef, useState} from "react"
import {api} from "../api/client"
import {WorkoutCard} from "./WorkoutCard"

interface Group {
    key: string
    title: string
    workouts: WorkoutDTO[]
}

/**
 * Welches Programm an einem Tag dran ist.
 *
 * Eigene Programme zuerst, danach die Reihen der Bibliothek - dieselben, die
 * App und Übersicht zeigen. Wer ein Programm dort kennt, findet es hier wieder.
 * Jedes Programm steht nur einmal da, auch wenn es in mehreren Reihen liegt.
 */
export function PlanPicker({
    weekdayName,
    onPick,
    onClose,
}: {
    weekdayName: string
    onPick: (workout: WorkoutDTO) => void
    onClose: () => void
}) {
    const [groups, setGroups] = useState<Group[] | null>(null)
    const [query, setQuery] = useState("")
    const [error, setError] = useState<string | null>(null)
    const dialog = useRef<HTMLDialogElement>(null)
    const search = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // `showModal` statt eines selbstgebauten Overlays: Fokus, Escape und
        // der abgedunkelte Hintergrund kommen vom Browser.
        // Danach ins Suchfeld: `showModal` fokussiert sonst das erste
        // Bedienelement, und das ist „Schließen“.
        dialog.current?.showModal()
        search.current?.focus()
    }, [])

    useEffect(() => {
        let cancelled = false
        Promise.all([api.myWorkouts(), api.discover()])
            .then(([mine, discovery]) => {
                if (cancelled) return
                const seen = new Set<string>()
                const unique = (workouts: WorkoutDTO[]) =>
                    workouts.filter((workout) => !seen.has(workout.id) && seen.add(workout.id))
                const result: Group[] = [{key: "own", title: "Deine Programme", workouts: unique(mine.workouts)}]
                for (const row of discovery.rows) {
                    result.push({key: row.key, title: row.title, workouts: unique(row.workouts)})
                }
                for (const collection of discovery.collections) {
                    result.push({key: collection.id, title: collection.name, workouts: unique(collection.workouts)})
                }
                setGroups(result.filter((group) => group.workouts.length > 0))
            })
            .catch(() => {
                if (!cancelled) setError("Die Programme konnten nicht geladen werden.")
            })
        return () => {
            cancelled = true
        }
    }, [])

    const visible = useMemo(() => {
        const text = query.trim().toLowerCase()
        if (groups === null || text.length === 0) return groups
        return groups
            .map((group) => ({
                ...group,
                workouts: group.workouts.filter(
                    (workout) =>
                        workout.name.toLowerCase().includes(text) ||
                        workout.tags.some((tag) => tag.toLowerCase().includes(text))
                ),
            }))
            .filter((group) => group.workouts.length > 0)
    }, [groups, query])

    return (
        <dialog ref={dialog} className="picker" onClose={onClose} onCancel={onClose}>
            <header className="picker-head">
                <h2>Programm für {weekdayName}</h2>
                <button type="button" className="ghost" onClick={onClose}>
                    Schließen
                </button>
            </header>
            <input
                ref={search}
                type="search"
                placeholder="Programm oder Schlagwort suchen"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
            />
            <div className="picker-body">
                {error !== null && <div className="message error">{error}</div>}
                {visible === null ? (
                    <p className="muted">Wird geladen …</p>
                ) : visible.length === 0 ? (
                    <p className="muted">Kein Programm passt zu „{query}“.</p>
                ) : (
                    visible.map((group) => (
                        <section key={group.key}>
                            <h3 className="picker-group">{group.title}</h3>
                            <div className="grid">
                                {group.workouts.map((workout) => (
                                    <WorkoutCard
                                        key={workout.id}
                                        workout={workout}
                                        compact
                                        onClick={() => onPick(workout)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
        </dialog>
    )
}
