import type {CollectionDTO, WorkoutDTO} from "@wattwerk/shared"
import {useEffect, useState} from "react"
import {Link, useNavigate, useParams} from "react-router-dom"
import {useAuth} from "../api/auth"
import {api, ApiError} from "../api/client"
import {WorkoutProfileChart} from "../components/WorkoutProfileChart"
import {formatClock, formatDuration, targetWatts, zoneColor} from "../components/workoutVisuals"

export function WorkoutDetailPage() {
    const {id} = useParams()
    const navigate = useNavigate()
    const {user} = useAuth()
    const [workout, setWorkout] = useState<WorkoutDTO | null>(null)
    const [collections, setCollections] = useState<CollectionDTO[]>([])
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const [found, mine] = await Promise.all([api.workout(id ?? ""), api.collections()])
                if (!cancelled) {
                    setWorkout(found)
                    setCollections(mine.collections)
                }
            } catch (caught) {
                if (!cancelled) {
                    setError(caught instanceof ApiError ? caught.message : "Nicht gefunden.")
                }
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [id])

    if (error !== null) {
        return (
            <>
                <div className="message error">{error}</div>
                <Link className="ghost button" to="/app/bibliothek">
                    Zurück zur Bibliothek
                </Link>
            </>
        )
    }

    if (workout === null) {
        return <p className="muted">Wird geladen …</p>
    }

    const isMine = workout.ownerUserID !== null && workout.ownerUserID === user?.id

    async function togglePublic() {
        if (workout === null) {
            return
        }
        const next = workout.visibility === "public" ? "private" : "public"
        try {
            const saved = await api.saveWorkout({
                id: workout.id,
                name: workout.name,
                summary: workout.summary,
                tags: workout.tags,
                visibility: next,
                segments: workout.segments,
            })
            setWorkout(saved)
            setNotice(
                next === "public"
                    ? "Das Programm ist jetzt öffentlich - andere finden es unter „Entdecken“."
                    : "Das Programm ist wieder privat."
            )
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Das hat nicht geklappt.")
        }
    }

    async function duplicate() {
        if (workout === null) {
            return
        }
        // Fremde und mitgelieferte Programme lassen sich nicht ändern - eine
        // Kopie in der eigenen Bibliothek schon.
        const copy = await api.createWorkout({
            name: `${workout.name} (Kopie)`,
            summary: workout.summary,
            tags: workout.tags,
            visibility: "private",
            segments: workout.segments,
        })
        navigate(`/app/programm/${copy.id}/bearbeiten`)
    }

    async function remove() {
        if (workout === null || !window.confirm(`„${workout.name}“ wirklich löschen?`)) {
            return
        }
        await api.deleteWorkout(workout.id)
        navigate("/app/bibliothek")
    }

    async function addTo(collectionID: string) {
        if (workout === null) {
            return
        }
        try {
            await api.addToCollection(collectionID, workout.id)
            setNotice("Zum Ordner hinzugefügt.")
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Das hat nicht geklappt.")
        }
    }

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>{workout.name}</h1>
                    <p className="muted">{workout.summary}</p>
                    <div className="tag-list">
                        {workout.tags.map((tag) => (
                            <span className="badge" key={tag}>
                                {tag}
                            </span>
                        ))}
                        {workout.isBuiltIn && <span className="badge">Katalog</span>}
                        {workout.visibility === "public" && <span className="badge public">Öffentlich</span>}
                        {workout.ownerName !== null && !workout.isBuiltIn && (
                            <span className="badge">von {workout.ownerName}</span>
                        )}
                    </div>
                </div>
            </div>

            {notice !== null && <div className="message success">{notice}</div>}

            <div className="card block">
                <WorkoutProfileChart segments={workout.segments} height={190} />
                <div className="stat-row">
                    <span>
                        <strong>{formatDuration(workout.durationSeconds)}</strong> Dauer
                    </span>
                    <span>
                        <strong>{workout.plannedTSS}</strong> TSS
                    </span>
                    <span>
                        <strong>{workout.segments.length}</strong> Blöcke
                    </span>
                </div>
            </div>

            <div className="actions block">
                {isMine && (
                    <>
                        <Link className="primary button" to={`/app/programm/${workout.id}/bearbeiten`}>
                            Bearbeiten
                        </Link>
                        <button type="button" className="ghost" onClick={togglePublic}>
                            {workout.visibility === "public" ? "Privat stellen" : "Öffentlich teilen"}
                        </button>
                        <button type="button" className="ghost danger" onClick={remove}>
                            Löschen
                        </button>
                    </>
                )}
                {!isMine && (
                    <button type="button" className="primary" onClick={duplicate}>
                        Kopie in meine Bibliothek
                    </button>
                )}
                {collections.length > 0 && (
                    <select
                        defaultValue=""
                        onChange={(event) => {
                            if (event.target.value !== "") {
                                void addTo(event.target.value)
                                event.target.value = ""
                            }
                        }}
                    >
                        <option value="">Zu Ordner hinzufügen …</option>
                        {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                                {collection.name}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <section className="card block">
                <h2>Ablauf</h2>
                <table className="table">
                    <tbody>
                        {workout.segments.map((segment, index) => {
                            const start = targetWatts(segment.target)
                            const end = targetWatts(segment.targetEnd ?? segment.target)
                            return (
                                <tr key={index}>
                                    <td className="index">{index + 1}</td>
                                    <td>
                                        <span
                                            className="zone-dot"
                                            style={{background: zoneColor(start ?? end)}}
                                        />
                                        {segment.title ?? "Block"}
                                        {segment.cadenceLow !== null &&
                                            segment.cadenceLow !== undefined && (
                                                <span className="muted tiny">
                                                    {" "}
                                                    · {segment.cadenceLow}–{segment.cadenceHigh} U/min
                                                </span>
                                            )}
                                    </td>
                                    <td className="numeric">
                                        {start === null
                                            ? "frei"
                                            : start === end
                                              ? `${start} W`
                                              : `${start} → ${end} W`}
                                    </td>
                                    <td className="numeric">{formatClock(segment.durationSeconds)}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                <p className="muted tiny">
                    Wattzahlen bei einer FTP von 200 W. In der App rechnet jedes Ziel gegen deine eigene FTP.
                </p>
            </section>
        </>
    )
}
