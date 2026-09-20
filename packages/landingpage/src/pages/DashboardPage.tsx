import type {DiscoveryResponse, TrainingSessionListResponse} from "@wattwerk/shared"
import {useEffect, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {useAuth} from "../api/auth"
import {api} from "../api/client"
import {WorkoutRow} from "../components/WorkoutRow"
import {formatClock, formatDate} from "../components/workoutVisuals"

export function DashboardPage() {
    const {user} = useAuth()
    const navigate = useNavigate()
    const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null)
    const [sessions, setSessions] = useState<TrainingSessionListResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

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
