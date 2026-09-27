import type {PlanEntryDTO, TrainingSessionResponse} from "@wattwerk/shared"
import {useEffect, useMemo, useState} from "react"
import {Link, useSearchParams} from "react-router-dom"
import {usePlan} from "../api/plan"
import {api} from "../api/client"
import {PlanPicker} from "../components/PlanPicker"
import {WorkoutProfileChart} from "../components/WorkoutProfileChart"
import {
    addDays,
    buildWeek,
    formatDayMonth,
    fromDateParam,
    isoWeekNumber,
    relativeWeekLabel,
    startOfWeek,
    toDateParam,
    WEEKDAYS,
    weekdayName,
    weeksBetween,
} from "../components/weekPlan"
import {formatDuration} from "../components/workoutVisuals"

/**
 * Der Wochenplan, Woche für Woche.
 *
 * Der Plan selbst ist eine Vorlage: welches Programm an welchem Wochentag dran
 * ist, jede Woche gleich - genau wie in der App. Durch die Wochen blättern
 * heißt deshalb: dieselbe Vorlage gegen das legen, was in der jeweiligen Woche
 * gefahren wurde. Rückwärts sieht man, was geklappt hat und was sonst noch
 * gefahren wurde; vorwärts, was kommt.
 *
 * Die Woche steht in der Adresse (`?woche=2026-09-28`), damit Zurück im
 * Browser funktioniert und sich eine Woche verlinken lässt.
 */
export function PlanPage() {
    const [params, setParams] = useSearchParams()
    const plan = usePlan()
    const [pickerDay, setPickerDay] = useState<number | null>(null)
    const [sessions, setSessions] = useState<TrainingSessionResponse[] | null>(null)
    const [sessionError, setSessionError] = useState<string | null>(null)

    const thisWeek = startOfWeek(new Date())
    const monday = startOfWeek(fromDateParam(params.get("woche")) ?? thisWeek)
    const mondayKey = toDateParam(monday)
    const offset = weeksBetween(thisWeek, monday)
    const isFuture = offset > 0

    useEffect(() => {
        // Eine Woche, die noch nicht angefangen hat, hat keine Einheiten.
        if (isFuture) {
            setSessions([])
            return
        }
        let cancelled = false
        setSessions(null)
        setSessionError(null)
        const start = fromDateParam(mondayKey) ?? thisWeek
        api.sessions(200, {from: start.toISOString(), to: addDays(start, 7).toISOString()})
            .then((result) => {
                if (!cancelled) setSessions(result.sessions)
            })
            .catch(() => {
                if (!cancelled) {
                    setSessions([])
                    setSessionError("Die gefahrenen Einheiten dieser Woche konnten nicht geladen werden.")
                }
            })
        return () => {
            cancelled = true
        }
    }, [mondayKey, isFuture])

    const week = useMemo(
        () => buildWeek(fromDateParam(mondayKey) ?? thisWeek, plan.entries ?? [], sessions ?? []),
        [mondayKey, plan.entries, sessions]
    )

    function goTo(date: Date) {
        const key = toDateParam(startOfWeek(date))
        setParams(key === toDateParam(thisWeek) ? {} : {woche: key})
    }

    const entries = plan.entries ?? []
    const done = week.completedBy.size
    const plannedTSS = entries.reduce((sum, entry) => sum + (entry.workout?.plannedTSS ?? 0), 0)
    const riddenTSS = (sessions ?? []).reduce((sum, session) => sum + session.trainingStressScore, 0)
    const sunday = addDays(monday, 6)

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>Wochenplan</h1>
                    <p className="muted">
                        Einmal festlegen, was an welchem Tag dran ist - der Plan gilt jede Woche, in der App
                        genauso wie hier.
                    </p>
                </div>
            </div>

            <nav className="week-nav card" aria-label="Woche wählen">
                <button type="button" className="ghost" onClick={() => goTo(addDays(monday, -7))} aria-label="Vorherige Woche">
                    ‹
                </button>
                <div className="week-nav-label">
                    <strong>{relativeWeekLabel(offset)}</strong>
                    <span className="muted tiny">
                        KW {isoWeekNumber(monday)} · {formatDayMonth(monday)} – {formatDayMonth(sunday)}{" "}
                        {sunday.getFullYear()}
                    </span>
                </div>
                <button type="button" className="ghost" onClick={() => goTo(addDays(monday, 7))} aria-label="Nächste Woche">
                    ›
                </button>
                {offset !== 0 && (
                    <button type="button" className="ghost tiny week-nav-today" onClick={() => goTo(new Date())}>
                        Zu dieser Woche
                    </button>
                )}
            </nav>

            {plan.error !== null && <div className="message error">{plan.error}</div>}
            {sessionError !== null && <div className="message error">{sessionError}</div>}

            <div className="stat-grid">
                <Stat label="Geplant" value={`${entries.length}`} unit={entries.length === 1 ? "Einheit" : "Einheiten"} />
                <Stat
                    label="Erledigt"
                    value={isFuture ? "–" : `${done}`}
                    unit={isFuture ? undefined : `von ${entries.length}`}
                />
                <Stat
                    label="Belastung"
                    value={isFuture ? "–" : `${riddenTSS}`}
                    unit={isFuture ? `${plannedTSS} TSS geplant` : `von ${plannedTSS} TSS`}
                />
            </div>

            {offset !== 0 && entries.length > 0 && (
                <p className="muted tiny plan-hint">
                    Der Plan ist für jede Woche derselbe. Was du hier änderst, gilt auch für alle anderen Wochen.
                </p>
            )}

            {plan.entries === null ? (
                <p className="muted">Wird geladen …</p>
            ) : (
                <div className="plan-days">
                    {week.days.map((day) => (
                        <section
                            key={day.day}
                            className={day.isToday ? "plan-day card today" : "plan-day card"}
                            aria-label={weekdayName(day.day)}
                        >
                            <header className="plan-day-head">
                                <strong>{weekdayName(day.day)}</strong>
                                <span className="muted tiny">{day.isToday ? "Heute" : formatDayMonth(day.date)}</span>
                            </header>

                            <div className="plan-day-body">
                                {day.entries.map((entry) => (
                                    <PlanEntryItem
                                        key={entry.id}
                                        entry={entry}
                                        completedBy={week.completedBy.get(entry.id)}
                                        isMissed={day.isPast && !week.completedBy.has(entry.id) && sessions !== null}
                                        onRemove={() => plan.remove(entry.id)}
                                        onMove={(weekday) => plan.move(entry.id, weekday)}
                                    />
                                ))}

                                {day.extraSessions.map((session) => (
                                    <Link key={session.id} className="plan-extra plain" to={`/app/verlauf/${session.id}`}>
                                        <span className="badge">Außerdem gefahren</span>
                                        <span>{session.workoutName}</span>
                                        <span className="muted tiny">
                                            {formatDuration(session.durationSeconds)} · {session.trainingStressScore} TSS
                                        </span>
                                    </Link>
                                ))}

                                <button type="button" className="plan-add" onClick={() => setPickerDay(day.day)}>
                                    + {day.entries.length === 0 ? "Programm einplanen" : "Noch eins"}
                                </button>
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {pickerDay !== null && (
                <PlanPicker
                    weekdayName={weekdayName(pickerDay)}
                    onClose={() => setPickerDay(null)}
                    onPick={(workout) => {
                        plan.add(workout, pickerDay)
                        setPickerDay(null)
                    }}
                />
            )}
        </>
    )
}

function PlanEntryItem({
    entry,
    completedBy,
    isMissed,
    onRemove,
    onMove,
}: {
    entry: PlanEntryDTO
    completedBy?: TrainingSessionResponse
    isMissed: boolean
    onRemove: () => void
    onMove: (weekday: number) => void
}) {
    const workout = entry.workout
    const className = ["plan-entry", completedBy ? "done" : "", isMissed ? "missed" : ""].join(" ").trim()

    return (
        <article className={className}>
            {workout !== null && <WorkoutProfileChart segments={workout.segments} height={36} showFTPLine={false} />}
            <div className="plan-entry-body">
                <div className="plan-entry-title">
                    {completedBy && (
                        <span className="plan-check" aria-label="Erledigt">
                            ✓
                        </span>
                    )}
                    {workout !== null ? (
                        <Link className="plain" to={`/app/programm/${workout.id}`}>
                            <strong>{workout.name}</strong>
                        </Link>
                    ) : (
                        <strong>{entry.workoutName}</strong>
                    )}
                </div>
                <div className="workout-card-meta">
                    {workout !== null ? (
                        <>
                            <span>{formatDuration(workout.durationSeconds)}</span>
                            <span>{workout.plannedTSS} TSS</span>
                        </>
                    ) : (
                        <span className="danger-text">Nicht mehr verfügbar</span>
                    )}
                    {completedBy && (
                        <Link className="plain" to={`/app/verlauf/${completedBy.id}`}>
                            gefahren {new Date(completedBy.startedAt).toLocaleDateString("de-DE", {weekday: "short"})}
                        </Link>
                    )}
                </div>
                <div className="plan-entry-actions">
                    <select
                        value=""
                        aria-label="Auf anderen Tag legen"
                        onChange={(event) => {
                            if (event.target.value !== "") onMove(Number(event.target.value))
                        }}
                    >
                        <option value="">Verschieben …</option>
                        {WEEKDAYS.filter(({day}) => day !== entry.weekday).map(({day, name}) => (
                            <option key={day} value={day}>
                                {name}
                            </option>
                        ))}
                    </select>
                    <button type="button" className="ghost tiny danger" onClick={onRemove}>
                        Entfernen
                    </button>
                </div>
            </div>
        </article>
    )
}

function Stat({label, value, unit}: {label: string; value: string; unit?: string}) {
    return (
        <div className="stat card">
            <span className="stat-label">{label}</span>
            <span className="stat-value">
                {value}
                {unit !== undefined && <span className="stat-unit">{unit}</span>}
            </span>
        </div>
    )
}
