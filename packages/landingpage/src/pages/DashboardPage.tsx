import type {DiscoveryResponse, TrainingSessionListResponse} from "@wattwerk/shared"
import {useEffect, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {useAuth} from "../api/auth"
import {api} from "../api/client"
import {usePlan} from "../api/plan"
import {WorkoutCard} from "../components/WorkoutCard"
import {WorkoutRow} from "../components/WorkoutRow"
import {isoWeekday, weekdayName} from "../components/weekPlan"
import {formatClock, formatDate} from "../components/workoutVisuals"

export function DashboardPage() {
    const {user} = useAuth()
    const navigate = useNavigate()
    const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null)
    const [sessions, setSessions] = useState<TrainingSessionListResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const plan = usePlan()

    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const [rows, history] = await Promise.all([api.discover(), api.sessions(5)])
                if (!cancelled) {
                    setDiscovery(rows)
                    setSessions(history)
                }
            } catch {
                if (!cancelled) {
                    setError("Die Daten konnten nicht geladen werden.")
                }
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [])

    const recommended = discovery?.rows.filter((row) => row.key !== "own").slice(0, 2) ?? []

    // Heute, sonst der nächste Tag dieser Woche, an dem etwas steht. Ob es
    // schon gefahren ist, zeigt die Wochenplan-Seite; hier geht es nur darum,
    // was als Nächstes dran ist.
    const today = isoWeekday(new Date())
    const planned = plan.entries ?? []
    const todays = planned.filter((entry) => entry.weekday === today)
    const nextDay = planned
        .map((entry) => entry.weekday)
        .filter((day) => day > today)
        .sort((a, b) => a - b)[0]
    const upcoming = todays.length > 0 ? todays : planned.filter((entry) => entry.weekday === nextDay)

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>Hallo{user?.name ? `, ${user.name}` : ""}.</h1>
                    <p className="muted">Was heute ansteht.</p>
                </div>
                <Link className="primary button" to="/app/programm/neu">
                    Programm erstellen
                </Link>
            </div>

            {error !== null && <div className="message error">{error}</div>}

            {upcoming.length > 0 && (
                <section className="row">
                    <header className="row-header">
                        <h2>{todays.length > 0 ? "Heute im Plan" : `Heute frei. Als Nächstes: ${weekdayName(nextDay)}`}</h2>
                        <Link to="/app/wochenplan" className="muted tiny">
                            Zum Wochenplan
                        </Link>
                    </header>
                    <div className="plan-today">
                        {upcoming.map((entry) =>
                            entry.workout !== null ? (
                                <WorkoutCard
                                    key={entry.id}
                                    workout={entry.workout}
                                    onClick={() => navigate(`/app/programm/${entry.workoutID}`)}
                                />
                            ) : null
                        )}
                    </div>
                </section>
            )}

            <div className="stat-grid">
                <Stat label="Belastung diese Woche" value={`${sessions?.stressLastSevenDays ?? 0}`} unit="TSS" />
                <Stat label="Einheiten gesamt" value={`${sessions?.sessions.length ?? 0}`} />
                <Stat label="FTP" value={`${user?.ftp ?? 0}`} unit="W" />
                <Stat
                    label="Watt pro Kilo"
                    value={
                        user && user.weightKg > 0 ? (user.ftp / user.weightKg).toFixed(2) : "--"
                    }
                    unit="W/kg"
                />
            </div>

            <section className="card block">
                <div className="section-head small">
                    <h2>Letzte Einheiten</h2>
                    <Link to="/app/verlauf" className="muted tiny">
                        Alle ansehen
                    </Link>
                </div>
                {sessions === null ? (
                    <p className="muted">Wird geladen …</p>
                ) : sessions.sessions.length === 0 ? (
                    <p className="muted">
                        Noch nichts gefahren. Sobald du in der App eine Einheit abschließt, steht sie hier.
                    </p>
                ) : (
                    <table className="table">
                        <tbody>
                            {sessions.sessions.map((session) => (
                                <tr key={session.id}>
                                    <td>
                                        <strong>{session.workoutName}</strong>
                                        <br />
                                        <span className="muted tiny">{formatDate(session.startedAt)}</span>
                                    </td>
                                    <td className="numeric">{formatClock(session.durationSeconds)}</td>
                                    <td className="numeric">{session.averagePower} W</td>
                                    <td className="numeric">{session.trainingStressScore} TSS</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {recommended.map((row) => (
                <WorkoutRow
                    key={row.key}
                    title={row.title}
                    subtitle={row.subtitle}
                    workouts={row.workouts}
                    onSelect={(workout) => navigate(`/app/programm/${workout.id}`)}
                />
            ))}
        </>
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
