import type {PowerTargetDTO, WorkoutSegmentDTO, WorkoutVisibility} from "@wattwerk/shared"
import {useEffect, useState} from "react"
import {useNavigate, useParams} from "react-router-dom"
import {api, ApiError} from "../api/client"
import {WorkoutProfileChart} from "../components/WorkoutProfileChart"
import {formatDuration, targetWatts, zoneColor} from "../components/workoutVisuals"

type Unit = "percentFTP" | "watts" | "free"

const EMPTY_SEGMENTS: WorkoutSegmentDTO[] = [
    {
        title: "Einfahren",
        durationSeconds: 600,
        target: {type: "percentFTP", value: 0.45},
        targetEnd: {type: "percentFTP", value: 0.7},
    },
    {title: "Block 1", durationSeconds: 600, target: {type: "percentFTP", value: 0.9}},
    {title: "Ausfahren", durationSeconds: 300, target: {type: "percentFTP", value: 0.5}},
]

export function WorkoutEditorPage() {
    const {id} = useParams()
    const navigate = useNavigate()

    const [name, setName] = useState("Neues Programm")
    const [summary, setSummary] = useState("")
    const [tags, setTags] = useState("")
    const [visibility, setVisibility] = useState<WorkoutVisibility>("private")
    const [segments, setSegments] = useState<WorkoutSegmentDTO[]>(EMPTY_SEGMENTS)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(id !== undefined)

    useEffect(() => {
        if (id === undefined) {
            return
        }
        let cancelled = false
        async function load() {
            try {
                const workout = await api.workout(id as string)
                if (cancelled) {
                    return
                }
                setName(workout.name)
                setSummary(workout.summary)
                setTags(workout.tags.join(", "))
                setVisibility(workout.visibility)
                setSegments(workout.segments)
            } catch (caught) {
                if (!cancelled) {
                    setError(caught instanceof ApiError ? caught.message : "Nicht gefunden.")
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [id])

    const totalSeconds = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0)

    function update(index: number, change: Partial<WorkoutSegmentDTO>) {
        setSegments((current) =>
            current.map((segment, position) => (position === index ? {...segment, ...change} : segment))
        )
    }

    function move(index: number, offset: number) {
        setSegments((current) => {
            const target = index + offset
            if (target < 0 || target >= current.length) {
                return current
            }
            const copy = [...current]
            const [moved] = copy.splice(index, 1)
            copy.splice(target, 0, moved)
            return copy
        })
    }

    async function save() {
        setBusy(true)
        setError(null)
        try {
            const saved = await api.saveWorkout({
                id,
                name,
                summary,
                visibility,
                tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter((tag) => tag.length > 0),
                segments,
            })
            navigate(`/app/programm/${saved.id}`)
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Speichern fehlgeschlagen.")
        } finally {
            setBusy(false)
        }
    }

    if (loading) {
        return <p className="muted">Wird geladen …</p>
    }

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>{id === undefined ? "Programm erstellen" : "Programm bearbeiten"}</h1>
                    <p className="muted">
                        {formatDuration(totalSeconds)} · {segments.length} Blöcke
                    </p>
                </div>
                <div className="actions">
                    <button type="button" className="ghost" onClick={() => navigate(-1)}>
                        Abbrechen
                    </button>
                    <button
                        type="button"
                        className="primary"
                        onClick={save}
                        disabled={busy || name.trim().length === 0 || segments.length === 0}
                    >
                        {busy ? "Speichert …" : "Sichern"}
                    </button>
                </div>
            </div>

            {error !== null && <div className="message error">{error}</div>}

            <div className="card block">
                <WorkoutProfileChart segments={segments} height={150} />
            </div>

            <div className="card block form-grid">
                <label>
                    Name
                    <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                    Sichtbarkeit
                    <select
                        value={visibility}
                        onChange={(event) => setVisibility(event.target.value as WorkoutVisibility)}
                    >
                        <option value="private">Privat</option>
                        <option value="public">Öffentlich</option>
                    </select>
                </label>
                <label className="wide">
                    Kurzbeschreibung
                    <input
                        type="text"
                        value={summary}
                        onChange={(event) => setSummary(event.target.value)}
                    />
                </label>
                <label className="wide">
                    Schlagworte, durch Komma getrennt
                    <input
                        type="text"
                        value={tags}
                        placeholder="Sweet Spot, Schwelle"
                        onChange={(event) => setTags(event.target.value)}
                    />
                </label>
            </div>

            <section className="card block">
                <h2>Blöcke</h2>
                <div className="segments">
                    {segments.map((segment, index) => (
                        <SegmentRow
                            key={index}
                            segment={segment}
                            index={index}
                            count={segments.length}
                            onChange={(change) => update(index, change)}
                            onMove={(offset) => move(index, offset)}
                            onDuplicate={() =>
                                setSegments((current) => [
                                    ...current.slice(0, index + 1),
                                    {...segment},
                                    ...current.slice(index + 1),
                                ])
                            }
                            onRemove={() =>
                                setSegments((current) => current.filter((_, position) => position !== index))
                            }
                        />
                    ))}
                </div>

                <div className="actions">
                    <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                            setSegments((current) => [
                                ...current,
                                {
                                    title: null,
                                    durationSeconds: 300,
                                    target: {type: "percentFTP", value: 0.75},
                                    targetEnd: null,
                                    cadenceLow: null,
                                    cadenceHigh: null,
                                },
                            ])
                        }
                    >
                        Block hinzufügen
                    </button>
                    <IntervalBuilder
                        onInsert={(created) => setSegments((current) => [...current, ...created])}
                    />
                </div>
            </section>
        </>
    )
}

function unitOf(target: PowerTargetDTO): Unit {
    return target.type
}

function makeTarget(unit: Unit, raw: number): PowerTargetDTO {
    if (unit === "free") {
        return {type: "free"}
    }
    if (unit === "watts") {
        return {type: "watts", value: Math.max(0, Math.round(raw))}
    }
    return {type: "percentFTP", value: Math.max(0, raw) / 100}
}

function displayValue(target: PowerTargetDTO): number {
    if (target.type === "percentFTP") {
        return Math.round((target.value ?? 0) * 100)
    }
    return Math.round(target.value ?? 0)
}

function SegmentRow({
    segment,
    index,
    count,
    onChange,
    onMove,
    onDuplicate,
    onRemove,
}: {
    segment: WorkoutSegmentDTO
    index: number
    count: number
    onChange: (change: Partial<WorkoutSegmentDTO>) => void
    onMove: (offset: number) => void
    onDuplicate: () => void
    onRemove: () => void
}) {
    const unit = unitOf(segment.target)
    const isRamp = segment.targetEnd !== null && segment.targetEnd !== undefined
    const minutes = Math.floor(segment.durationSeconds / 60)
    const seconds = segment.durationSeconds % 60

    return (
        <div className="segment-row">
            <span className="zone-dot" style={{background: zoneColor(targetWatts(segment.target))}} />

            <input
                className="segment-title"
                type="text"
                placeholder={`Block ${index + 1}`}
                value={segment.title ?? ""}
                onChange={(event) => onChange({title: event.target.value || null})}
            />

            <span className="duration-input">
                <input
                    type="number"
                    min={0}
                    value={minutes}
                    onChange={(event) =>
                        onChange({durationSeconds: Math.max(1, Number(event.target.value) * 60 + seconds)})
                    }
                />
                :
                <input
                    type="number"
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={(event) =>
                        onChange({
                            durationSeconds: Math.max(
                                1,
                                minutes * 60 + Math.min(59, Math.max(0, Number(event.target.value)))
                            ),
                        })
                    }
                />
            </span>

            <select
                value={unit}
                onChange={(event) => {
                    const next = event.target.value as Unit
                    onChange({
                        target: makeTarget(next, displayValue(segment.target)),
                        targetEnd:
                            isRamp && segment.targetEnd
                                ? makeTarget(next, displayValue(segment.targetEnd))
                                : null,
                    })
                }}
            >
                <option value="percentFTP">% FTP</option>
                <option value="watts">Watt</option>
                <option value="free">frei</option>
            </select>

            {unit !== "free" && (
                <>
                    <input
                        className="value-input"
                        type="number"
                        min={0}
                        value={displayValue(segment.target)}
                        onChange={(event) => onChange({target: makeTarget(unit, Number(event.target.value))})}
                    />
                    <label className="checkbox tiny">
                        <input
                            type="checkbox"
                            checked={isRamp}
                            onChange={(event) =>
                                onChange({
                                    targetEnd: event.target.checked
                                        ? makeTarget(unit, displayValue(segment.target) + 20)
                                        : null,
                                })
                            }
                        />
                        Rampe
                    </label>
                    {isRamp && segment.targetEnd && (
                        <input
                            className="value-input"
                            type="number"
                            min={0}
                            value={displayValue(segment.targetEnd)}
                            onChange={(event) =>
                                onChange({targetEnd: makeTarget(unit, Number(event.target.value))})
                            }
                        />
                    )}
                </>
            )}

            <span className="segment-actions">
                <button type="button" className="ghost tiny" onClick={() => onMove(-1)} disabled={index === 0}>
                    ↑
                </button>
                <button
                    type="button"
                    className="ghost tiny"
                    onClick={() => onMove(1)}
                    disabled={index === count - 1}
                >
                    ↓
                </button>
                <button type="button" className="ghost tiny" onClick={onDuplicate}>
                    ⧉
                </button>
                <button type="button" className="ghost tiny danger" onClick={onRemove}>
                    ✕
                </button>
            </span>
        </div>
    )
}

/** Erzeugt eine ganze Intervallserie - der Grund, warum niemand 20 Blöcke tippt. */
function IntervalBuilder({onInsert}: {onInsert: (segments: WorkoutSegmentDTO[]) => void}) {
    const [open, setOpen] = useState(false)
    const [count, setCount] = useState(4)
    const [workMinutes, setWorkMinutes] = useState(4)
    const [workPercent, setWorkPercent] = useState(105)
    const [restMinutes, setRestMinutes] = useState(3)
    const [restPercent, setRestPercent] = useState(55)

    if (!open) {
        return (
            <button type="button" className="ghost" onClick={() => setOpen(true)}>
                Intervallserie …
            </button>
        )
    }

    function insert() {
        const created: WorkoutSegmentDTO[] = []
        for (let index = 1; index <= count; index++) {
            created.push({
                title: `Intervall ${index}/${count}`,
                durationSeconds: workMinutes * 60,
                target: {type: "percentFTP", value: workPercent / 100},
                targetEnd: null,
                cadenceLow: null,
                cadenceHigh: null,
            })
            if (index < count) {
                created.push({
                    title: `Pause ${index}`,
                    durationSeconds: restMinutes * 60,
                    target: {type: "percentFTP", value: restPercent / 100},
                    targetEnd: null,
                    cadenceLow: null,
                    cadenceHigh: null,
                })
            }
        }
        onInsert(created)
        setOpen(false)
    }

    return (
        <div className="interval-builder card">
            <h3>Intervallserie</h3>
            <div className="form-grid">
                <label>
                    Wiederholungen
                    <input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                </label>
                <label>
                    Belastung (min)
                    <input type="number" min={1} value={workMinutes} onChange={(e) => setWorkMinutes(Number(e.target.value))} />
                </label>
                <label>
                    Belastung (% FTP)
                    <input type="number" min={30} value={workPercent} onChange={(e) => setWorkPercent(Number(e.target.value))} />
                </label>
                <label>
                    Pause (min)
                    <input type="number" min={1} value={restMinutes} onChange={(e) => setRestMinutes(Number(e.target.value))} />
                </label>
                <label>
                    Pause (% FTP)
                    <input type="number" min={20} value={restPercent} onChange={(e) => setRestPercent(Number(e.target.value))} />
                </label>
            </div>
            <div className="actions">
                <button type="button" className="primary" onClick={insert}>
                    Einfügen
                </button>
                <button type="button" className="ghost" onClick={() => setOpen(false)}>
                    Abbrechen
                </button>
            </div>
        </div>
    )
}
