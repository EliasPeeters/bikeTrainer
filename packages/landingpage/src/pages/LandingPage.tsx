import {useState} from "react"
import {Link} from "react-router-dom"
import {useAuth} from "../api/auth"
import {ApiError} from "../api/client"

const FEATURES = [
    {
        icon: "\u{1F4C8}",
        title: "Programme statt Zufall",
        text: "Sweet Spot, Over-Unders, 30/30er, Rampentest – oder selbst gebaute Blöcke. Alle Vorgaben rechnen in Prozent deiner FTP.",
    },
    {
        icon: "\u{1F6B4}",
        title: "Der Trainer macht mit",
        text: "Wattwerk spricht FTMS über Bluetooth und stellt den Widerstand selbst ein. Du trittst, die App hält die Wattzahl.",
    },
    {
        icon: "\u{2601}\u{FE0F}",
        title: "Überall dieselbe Bibliothek",
        text: "Mit Konto liegen Programme, Ordner und gefahrene Einheiten in der Cloud – am Mac gebaut, am Apple TV gefahren.",
    },
    {
        icon: "\u{1F464}",
        title: "Auch ohne Konto",
        text: "Die App läuft komplett ohne Anmeldung. Ein Konto bringt den Abgleich und das Portal, mehr nicht.",
    },
]

type Mode = "register" | "login"

export function LandingPage() {
    return (
        <div className="page">
            <header className="top">
                <div className="logo">
                    <img className="logo-mark" src="/icon-180.png" alt="" />
                    Wattwerk
                </div>
                <span className="muted tiny">Beta</span>
            </header>

            <section className="hero">
                <div>
                    <h1>Indoor fahren, ohne die Zeit abzusitzen.</h1>
                    <p className="lead">
                        Wattwerk steuert deinen Smarttrainer, fährt dein Programm Block für Block und
                        zeichnet jede Einheit auf. Kein Abo, keine Avatare – nur die Zahlen, auf die es
                        ankommt.
                    </p>
                    <ul className="platforms">
                        <li>macOS</li>
                        <li>Apple TV</li>
                        <li>Web-Portal</li>
                        <li>FTMS-Trainer</li>
                    </ul>
                </div>

                <AuthCard />
            </section>

            <section className="features">
                {FEATURES.map((feature) => (
                    <article className="feature card" key={feature.title}>
                        <span className="icon" aria-hidden="true">
                            {feature.icon}
                        </span>
                        <h3>{feature.title}</h3>
                        <p className="muted">{feature.text}</p>
                    </article>
                ))}
            </section>

            <footer className="bottom">
                <span>Wattwerk – strukturiertes Indoor-Radtraining</span>
                <span>
                    <Link to="/datenschutz">Datenschutz</Link>
                </span>
            </footer>
        </div>
    )
}

function AuthCard() {
    const {login, register} = useAuth()
    const [mode, setMode] = useState<Mode>("register")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [name, setName] = useState("")
    const [mailContactAllowed, setMailContactAllowed] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function submit(event: React.FormEvent) {
        event.preventDefault()
        setBusy(true)
        setError(null)
        try {
            if (mode === "register") {
                await register(email, password, name, mailContactAllowed)
            } else {
                await login(email, password)
            }
            // Nach dem Erfolg übernimmt der Router: der angemeldete Zustand
            // leitet die Startseite auf das Portal um.
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : "Da ist etwas schiefgegangen. Bitte erneut versuchen."
            )
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="card">
            <div className="tabs">
                <button
                    type="button"
                    className={mode === "register" ? "tab active" : "tab"}
                    onClick={() => {
                        setMode("register")
                        setError(null)
                    }}
                >
                    Konto anlegen
                </button>
                <button
                    type="button"
                    className={mode === "login" ? "tab active" : "tab"}
                    onClick={() => {
                        setMode("login")
                        setError(null)
                    }}
                >
                    Anmelden
                </button>
            </div>

            <p className="hint">
                {mode === "register"
                    ? "Mit Konto liegen deine Programme und Einheiten in der Cloud."
                    : "Willkommen zurück."}
            </p>

            {error !== null && (
                <div className="message error" role="alert">
                    {error}
                </div>
            )}

            <form onSubmit={submit}>
                {mode === "register" && (
                    <>
                        <label htmlFor="name">Name (optional)</label>
                        <input
                            id="name"
                            type="text"
                            autoComplete="name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            disabled={busy}
                        />
                    </>
                )}

                <label htmlFor="email">E-Mail</label>
                <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={busy}
                />

                <label htmlFor="password">Passwort</label>
                <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy}
                />

                {mode === "register" && (
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={mailContactAllowed}
                            onChange={(event) => setMailContactAllowed(event.target.checked)}
                            disabled={busy}
                        />
                        <span>Haltet mich per Mail auf dem Laufenden, wenn es Neues gibt.</span>
                    </label>
                )}

                <button className="primary" type="submit" disabled={busy}>
                    {busy ? "Einen Moment …" : mode === "register" ? "Konto anlegen" : "Anmelden"}
                </button>
            </form>
        </div>
    )
}
