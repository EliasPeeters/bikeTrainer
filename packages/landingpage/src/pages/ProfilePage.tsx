import {useState} from "react"
import {useAuth} from "../api/auth"
import {api, ApiError} from "../api/client"

export function ProfilePage() {
    const {user, setUser} = useAuth()
    const [name, setName] = useState(user?.name ?? "")
    const [ftp, setFtp] = useState(user?.ftp ?? 200)
    const [maxHeartRate, setMaxHeartRate] = useState(user?.maxHeartRate ?? 185)
    const [restingHeartRate, setRestingHeartRate] = useState(user?.restingHeartRate ?? 55)
    const [weightKg, setWeightKg] = useState(user?.weightKg ?? 75)
    const [mailContactAllowed, setMailContactAllowed] = useState(user?.mailContactAllowed ?? false)
    const [notice, setNotice] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function save(event: React.FormEvent) {
        event.preventDefault()
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
            const updated = await api.updateProfile({
                name,
                ftp,
                maxHeartRate,
                restingHeartRate,
                weightKg,
                mailContactAllowed,
            })
            setUser(updated)
            setNotice("Gespeichert. Die App übernimmt die Werte beim nächsten Abgleich.")
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Speichern fehlgeschlagen.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>Profil</h1>
                    <p className="muted">{user?.email}</p>
                </div>
            </div>

            {notice !== null && <div className="message success">{notice}</div>}
            {error !== null && <div className="message error">{error}</div>}

            <form className="card block form-grid" onSubmit={save}>
                <label className="wide">
                    Name
                    <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                    FTP (W)
                    <input
                        type="number"
                        min={50}
                        max={600}
                        value={ftp}
                        onChange={(event) => setFtp(Number(event.target.value))}
                    />
                </label>
                <label>
                    Gewicht (kg)
                    <input
                        type="number"
                        min={30}
                        max={250}
                        step="0.5"
                        value={weightKg}
                        onChange={(event) => setWeightKg(Number(event.target.value))}
                    />
                </label>
                <label>
                    Maximalpuls
                    <input
                        type="number"
                        min={120}
                        max={230}
                        value={maxHeartRate}
                        onChange={(event) => setMaxHeartRate(Number(event.target.value))}
                    />
                </label>
                <label>
                    Ruhepuls
                    <input
                        type="number"
                        min={30}
                        max={100}
                        value={restingHeartRate}
                        onChange={(event) => setRestingHeartRate(Number(event.target.value))}
                    />
                </label>

                <label className="checkbox wide">
                    <input
                        type="checkbox"
                        checked={mailContactAllowed}
                        onChange={(event) => setMailContactAllowed(event.target.checked)}
                    />
                    <span>Haltet mich per Mail auf dem Laufenden.</span>
                </label>

                <div className="actions wide">
                    <button type="submit" className="primary" disabled={busy}>
                        {busy ? "Speichert …" : "Sichern"}
                    </button>
                    <span className="muted tiny">
                        Alle Programme rechnen in Prozent der FTP – ändert sie sich, passen sich alle
                        Vorgaben an.
                    </span>
                </div>
            </form>
        </>
    )
}
