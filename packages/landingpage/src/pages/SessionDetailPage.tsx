import type {RideTrackDTO, TrainingSessionResponse} from "@wattwerk/shared"
import {useCallback, useEffect, useState} from "react"
import {Link, useNavigate, useParams} from "react-router-dom"
import {api, ApiError} from "../api/client"
import {RideTrackChart} from "../components/RideTrackChart"
import {
    formatMetric,
    hasMetric,
    RIDE_METRICS,
    summarize,
    type RideMetricKey,
} from "../components/rideMetrics"
import {formatClock, formatDate} from "../components/workoutVisuals"

/**
 * Eine gefahrene Einheit mit ihrem Sekundenverlauf.
 *
 * Zwei Aufrufe statt einem: die Zusammenfassung ist ein paar hundert Byte und
 * soll sofort dastehen, die Kurve kann ein paar hundert Kilobyte sein. Auf sie
 * zu warten, bevor überhaupt etwas erscheint, hieße eine leere Seite zu zeigen,
 * obwohl alle Zahlen längst da sind.
 */
export function SessionDetailPage() {
    const {id} = useParams()
    const navigate = useNavigate()
    const sessionID = Number(id)

    const [session, setSession] = useState<TrainingSessionResponse | null>(null)
    const [track, setTrack] = useState<RideTrackDTO | null>(null)
    const [trackProblem, setTrackProblem] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [shown, setShown] = useState<Set<RideMetricKey>>(new Set(["power"]))

    const load = useCallback(async () => {
        if (!Number.isFinite(sessionID)) {
            setError("Diese Einheit gibt es nicht.")
            return
        }

        let loaded: TrainingSessionResponse
        try {
            loaded = await api.session(sessionID)
        } catch (problem) {
            setError(message(problem, "Die Einheit konnte nicht geladen werden."))
            return
        }
        setSession(loaded)

        // Eine fehlende Kurve ist kein Fehler der Seite: die Zahlen stehen
        // trotzdem, und der Grund gehört an die Stelle, wo die Kurve wäre.
        if (!loaded.hasTrack) {
            setTrackProblem(
                "Zu dieser Einheit liegt kein Sekundenverlauf. Sie wurde vor Version 1.1 " +
                    "hochgeladen oder auf einem Gerät aufgezeichnet, das keinen speichert."
            )
            return
        }

        try {
            setTrack((await api.sessionTrack(sessionID)).track)
        } catch (problem) {
            setTrackProblem(message(problem, "Der Verlauf konnte nicht geladen werden."))
        }
    }, [sessionID])

    useEffect(() => {
        void load()
    }, [load])

    async function remove() {
        if (!window.confirm("Diese Einheit wirklich löschen? Der Verlauf geht mit.")) {
            return
        }
        await api.deleteSession(sessionID)
        navigate("/app/verlauf")
    }

    if (error !== null) {
        return (
            <>
                <div className="message error">{error}</div>
                <Link className="ghost button" to="/app/verlauf">
                    Zurück zum Verlauf
                </Link>
            </>
        )
    }

    if (session === null) {
        return <p className="muted">Wird geladen …</p>
    }

    const available = track === null ? [] : RIDE_METRICS.filter((metric) => hasMetric(track, metric.key))

    function toggle(key: RideMetricKey) {
        setShown((current) => {
            const next = new Set(current)
            if (next.has(key)) {
                // Die letzte Kurve bleibt an: ein leeres Diagramm ist kein
                // Zustand, den jemand gewollt hat.
                if (next.size > 1) {
                    next.delete(key)
                }
            } else {
                next.add(key)
            }
            return next
        })
    }

    return (
        <>
            <div className="section-head">
                <div>
                    <Link className="muted tiny" to="/app/verlauf">
                        ← Verlauf
                    </Link>
                    <h1>{session.workoutName}</h1>
                    <p className="muted">
                        {formatDate(session.startedAt)}
                        {!session.completed && <span className="badge"> abgebrochen</span>}
                    </p>
                </div>
                <div className="actions">
                    <button type="button" className="ghost danger" onClick={() => void remove()}>
                        Löschen
                    </button>
                </div>
            </div>

            <div className="stat-grid">
                <Stat label="Dauer" value={formatClock(session.durationSeconds)} />
                <Stat label="Ø Leistung" value={String(session.averagePower)} unit="W" />
                <Stat label="Max" value={String(session.maxPower)} unit="W" />
                <Stat label="NP" value={String(session.normalizedPower)} unit="W" />
                <Stat label="IF" value={session.intensityFactor.toFixed(2)} />
                <Stat label="TSS" value={String(session.trainingStressScore)} />
                <Stat label="Arbeit" value={String(session.kilojoules)} unit="kJ" />
                <Stat label="Ø Puls" value={session.averageHeartRate?.toString() ?? "–"} unit="bpm" />
            </div>

            {track === null ? (
                <div className="card block">
                    <p className="muted">{trackProblem ?? "Der Verlauf wird geladen …"}</p>
                </div>
            ) : (
                <div className="card block">
                    <div className="section-head small">
                        <h2>Verlauf über die Zeit</h2>
                        <div className="metric-toggles">
                            {available.map((metric) => (
                                <button
                                    key={metric.key}
                                    type="button"
                                    className={`metric-toggle${shown.has(metric.key) ? " active" : ""}`}
                                    onClick={() => toggle(metric.key)}
                                >
                                    <i style={{background: metric.color}} />
                                    {metric.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <RideTrackChart track={track} ftp={session.ftp} metrics={shown} />

                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Messgröße</th>
                                    <th className="numeric">Minimum</th>
                                    <th className="numeric">Ø</th>
                                    <th className="numeric">Maximum</th>
                                </tr>
                            </thead>
                            <tbody>
                                {available.map((metric) => {
                                    const summary = summarize(track, metric.key)
                                    if (summary === null) {
                                        return null
                                    }
                                    return (
                                        <tr key={metric.key}>
                                            <td>
                                                <span
                                                    className="zone-dot"
                                                    style={{background: metric.color}}
                                                />
                                                {metric.label}
                                            </td>
                                            <td className="numeric">
                                                {formatMetric(summary.min, metric)} {metric.unit}
                                            </td>
                                            <td className="numeric">
                                                {formatMetric(summary.average, metric)} {metric.unit}
                                            </td>
                                            <td className="numeric">
                                                {formatMetric(summary.max, metric)} {metric.unit}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <p className="muted tiny">
                        {track.sampleCount.toLocaleString("de-DE")} Messpunkte im Abstand von{" "}
                        {track.sampleIntervalSeconds} s
                    </p>
                </div>
            )}
        </>
    )
}

function message(problem: unknown, fallback: string): string {
    return problem instanceof ApiError ? problem.message : fallback
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
