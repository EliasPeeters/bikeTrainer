import type {TrainingSessionListResponse} from "@wattwerk/shared"
import {useCallback, useEffect, useState} from "react"
import {api} from "../api/client"
import {formatClock, formatDate} from "../components/workoutVisuals"

export function HistoryPage() {
    const [data, setData] = useState<TrainingSessionListResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        try {
            setData(await api.sessions(100))
        } catch {
            setError("Der Verlauf konnte nicht geladen werden.")
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    async function remove(id: number) {
        if (!window.confirm("Diese Einheit wirklich löschen?")) {
            return
        }
        await api.deleteSession(id)
        await reload()
    }

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>Verlauf</h1>
                    <p className="muted">Alles, was die App hochgeladen hat.</p>
                </div>
                {data !== null && (
                    <div className="stat card compact">
                        <span className="stat-label">Diese Woche</span>
                        <span className="stat-value">
                            {data.stressLastSevenDays}
                            <span className="stat-unit">TSS</span>
                        </span>
                    </div>
                )}
            </div>

            {error !== null && <div className="message error">{error}</div>}

            {data === null ? (
                <p className="muted">Wird geladen …</p>
            ) : data.sessions.length === 0 ? (
                <div className="card block">
                    <p className="muted">
                        Noch keine Einheiten. Die App lädt sie nach jeder gefahrenen Einheit hoch, sobald du
                        dort angemeldet bist.
                    </p>
                </div>
            ) : (
                <div className="card block">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Einheit</th>
                                <th className="numeric">Dauer</th>
                                <th className="numeric">Ø</th>
                                <th className="numeric">NP</th>
                                <th className="numeric">IF</th>
                                <th className="numeric">TSS</th>
                                <th className="numeric">Puls</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.sessions.map((session) => (
                                <tr key={session.id}>
                                    <td>
                                        <strong>{session.workoutName}</strong>
                                        {!session.completed && (
                                            <span className="badge"> abgebrochen</span>
                                        )}
                                        <br />
                                        <span className="muted tiny">{formatDate(session.startedAt)}</span>
                                    </td>
                                    <td className="numeric">{formatClock(session.durationSeconds)}</td>
                                    <td className="numeric">{session.averagePower} W</td>
                                    <td className="numeric">{session.normalizedPower} W</td>
                                    <td className="numeric">{session.intensityFactor.toFixed(2)}</td>
                                    <td className="numeric">{session.trainingStressScore}</td>
                                    <td className="numeric">
                                        {session.averageHeartRate ?? "–"}
                                    </td>
                                    <td className="numeric">
                                        <button
                                            type="button"
                                            className="ghost tiny danger"
                                            onClick={() => remove(session.id)}
                                        >
                                            Löschen
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    )
}
