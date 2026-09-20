import {useState} from "react"
import {Link} from "react-router-dom"
import {useAuth} from "../api/auth"
import {ApiError} from "../api/client"

type Mode = "register" | "login"

/// Eine Reihe im Hauptteil: Bild auf der einen, Erklärung auf der anderen
/// Seite. Die Bilder sind echte Aufnahmen der App, keine Montagen - sie
/// entstehen mit `Scripts/screenshots/` und liegen unter `public/shots`.
const SHOWCASE = [
    {
        id: "bibliothek",
        image: "/shots/mac-bibliothek.webp",
        caption: "Die Bibliothek am Mac",
        title: "Ein Katalog, der schon gefüllt ist",
        text:
            "Grundlage, Sweet Spot, Over-Unders, VO2max, Tabata, Rampentest – die mitgelieferten " +
            "Programme decken ab, was eine Trainingswoche braucht. Jede Karte zeigt das Profil, die " +
            "Dauer und die Belastung, bevor du sie öffnest.",
        points: [
            "Reihen nach Länge und Art, wie bei einem Streaming-Dienst",
            "Eigene Programme und Ordner stehen gleich daneben",
            "Alle Vorgaben in Prozent deiner FTP",
        ],
    },
    {
        id: "programm",
        image: "/shots/mac-programm.webp",
        caption: "Ein Programm im Detail",
        title: "Vor dem Start weißt du, was kommt",
        text:
            "Das Leistungsprofil, die Belastung in TSS, der Intensitätsfaktor und die Spitzenleistung " +
            "in Watt – umgerechnet auf deine FTP. Darunter der Ablauf: jeder Block mit Dauer und, wo es " +
            "darauf ankommt, mit Zieltrittfrequenz.",
        points: [
            "Kennzahlen in deinen Watt, nicht in Prozent zum Selberrechnen",
            "Jeder Block einzeln aufgeführt",
            "Ein Knopf, und die Einheit läuft",
        ],
    },
    {
        id: "editor",
        image: "/shots/mac-editor.webp",
        caption: "Der Programm-Editor",
        title: "Eigene Programme, Block für Block",
        text:
            "Konstant oder Rampe, Dauer, Zielwert in Prozent FTP oder in Watt. Blöcke lassen sich " +
            "verschieben, verdoppeln und löschen; das Profil und die Kennzahlen rechnen dabei mit.",
        points: [
            "Vorgaben wahlweise in % FTP oder in Watt",
            "Belastung und Intensität stehen während des Bauens daneben",
            "Öffentlich geteilte Programme finden andere unter „Entdecken“",
        ],
    },
    {
        id: "fahrt",
        image: "/shots/mac-fahrt.webp",
        caption: "Während der Einheit",
        title: "Der Trainer stellt sich selbst ein",
        text:
            "Wattwerk spricht FTMS über Bluetooth Low Energy und gibt deinem Smarttrainer die " +
            "Zielleistung vor. Du trittst, der Widerstand folgt dem Programm. Die große Zahl färbt " +
            "sich grün, solange du im Ziel bist.",
        points: [
            "Restzeit im Block, Trittfrequenz, Puls, Ø-Leistung, NP und Arbeit",
            "Zu hart? Ein Druck auf Minus, und die ganze Einheit wird leichter",
            "Block vor, Block zurück, Pause – ohne das Programm zu verlassen",
        ],
    },
    {
        id: "appletv",
        image: "/shots/tv-fahrt.webp",
        caption: "Dieselbe Fahrt auf dem Apple TV",
        title: "Im Wohnzimmer aus drei Metern lesbar",
        text:
            "Die Apple-TV-App ist kein Anhängsel, sondern dieselbe App mit größerer Schrift und " +
            "Bedienung über die Fernbedienung. Der Trainer verbindet sich direkt mit dem Apple TV – " +
            "der Mac muss nicht mitlaufen.",
        points: [
            "Bibliothek, Fahrt, Auswertung, Verlauf und Profil wie am Mac",
            "Play/Pause auf der Fernbedienung hält die Einheit an",
            "Der Bildschirm schläft während der Fahrt nicht ein",
        ],
    },
    {
        id: "auswertung",
        image: "/shots/mac-auswertung.webp",
        caption: "Nach der Einheit",
        title: "Was bleibt, sind die Zahlen",
        text:
            "Dauer, Durchschnitt, normalisierte Leistung, Belastung, Arbeit und Ø-Puls – dazu, wie " +
            "lange du in welcher Zone unterwegs warst. Speichern oder verwerfen, das entscheidest du.",
        points: [
            "Zeit in den Zonen Z1 bis Z7, aus der tatsächlich gefahrenen Leistung",
            "Im Verlauf steht danach jede Einheit mit Dauer, Ø, NP und TSS",
            "Die Wochenbelastung addiert sich oben von selbst",
        ],
    },
    {
        id: "geraete",
        image: "/shots/mac-geraete.webp",
        caption: "Geräte",
        title: "Trainer, Pulsgurt – oder erst mal gar nichts",
        text:
            "Die Suche findet Smarttrainer und Pulsgurte in Reichweite und zeigt am Abzeichen FTMS, " +
            "ob sich der Widerstand steuern lässt. Einmal verbunden, meldet sich das Gerät beim " +
            "nächsten Start von allein.",
        points: [
            "Steuerbare Trainer, reine Leistungsmesser und Pulsgurte",
            "Ein eigener Pulsgurt sticht den Wert, den der Trainer durchreicht",
            "Kein Rad im Raum? Der Simulator erzeugt glaubhafte Werte",
        ],
    },
]

const PLATFORMS = [
    {
        title: "macOS",
        text: "Programme bauen, fahren, auswerten. Ab macOS 14.",
    },
    {
        title: "Apple TV",
        text: "Dieselbe App fürs Wohnzimmer. Ab tvOS 17.",
    },
    {
        title: "Web-Portal",
        text: "Bibliothek, Editor, Ordner und Verlauf im Browser.",
    },
    {
        title: "FTMS-Trainer",
        text: "Jeder Smarttrainer, der den offenen Standard spricht.",
    },
]

export function LandingPage() {
    const [mode, setMode] = useState<Mode>("register")

    function jumpToAuth(next: Mode) {
        setMode(next)
        document.getElementById("konto")?.scrollIntoView({behavior: "smooth", block: "start"})
    }

    return (
        <div className="landing">
            <nav className="menubar">
                <div className="menubar-inner">
                    <a className="logo" href="#top">
                        <img className="logo-mark" src="/icon-180.png" alt="" />
                        Wattwerk
                        <span className="badge">Beta</span>
                    </a>

                    <div className="menu-links">
                        <a href="#funktionen">Funktionen</a>
                        <a href="#plattformen">Plattformen</a>
                        <Link to="/datenschutz">Datenschutz</Link>
                        <Link to="/impressum">Impressum</Link>
                    </div>

                    <div className="menu-actions">
                        <button type="button" className="ghost" onClick={() => jumpToAuth("login")}>
                            Anmelden
                        </button>
                        <button type="button" className="primary" onClick={() => jumpToAuth("register")}>
                            Konto anlegen
                        </button>
                    </div>
                </div>
            </nav>

            <main className="page" id="top">
                <section className="hero">
                    <p className="eyebrow">Strukturiertes Indoor-Radtraining</p>
                    <h1>Indoor fahren, ohne die Zeit abzusitzen.</h1>
                    <p className="lead">
                        Wattwerk steuert deinen Smarttrainer, fährt dein Programm Block für Block und
                        zeichnet jede Einheit auf. Für den Mac und den Apple TV. Kein Abo, keine Avatare
                        – nur die Zahlen, auf die es ankommt.
                    </p>
                    <div className="hero-actions">
                        <button type="button" className="primary" onClick={() => jumpToAuth("register")}>
                            Konto anlegen
                        </button>
                        <a className="ghost button" href="#funktionen">
                            Ansehen, was die App kann
                        </a>
                    </div>
                    <ul className="platforms">
                        {PLATFORMS.map((platform) => (
                            <li key={platform.title}>{platform.title}</li>
                        ))}
                    </ul>
                </section>

                <figure className="hero-shot">
                    <img
                        src="/shots/mac-bibliothek.webp"
                        width={1760}
                        height={1100}
                        alt="Die Bibliothek der Mac-App mit den mitgelieferten Programmen"
                    />
                </figure>

                <section className="stats">
                    <div>
                        <strong>Kein Abo</strong>
                        <span>Einmal geladen, dann gehört sie dir</span>
                    </div>
                    <div>
                        <strong>FTMS</strong>
                        <span>Offener Standard statt Insellösung</span>
                    </div>
                    <div>
                        <strong>Ohne Konto</strong>
                        <span>Jede Funktion auch ohne Anmeldung</span>
                    </div>
                </section>

                <section id="funktionen" className="showcase">
                    <h2 className="section-title">Was die App kann</h2>
                    {SHOWCASE.map((row, index) => (
                        <article
                            className={index % 2 === 1 ? "show-row reversed" : "show-row"}
                            key={row.id}
                        >
                            <figure className="show-shot">
                                <img src={row.image} alt={row.caption} loading="lazy" />
                                <figcaption>{row.caption}</figcaption>
                            </figure>
                            <div className="show-text">
                                <h3>{row.title}</h3>
                                <p className="muted">{row.text}</p>
                                <ul className="ticks">
                                    {row.points.map((point) => (
                                        <li key={point}>{point}</li>
                                    ))}
                                </ul>
                            </div>
                        </article>
                    ))}
                </section>

                <section id="plattformen" className="platform-section">
                    <h2 className="section-title">Überall dasselbe Training</h2>
                    <p className="section-lead muted">
                        Mit Konto liegen Programme, Ordner und gefahrene Einheiten in der Cloud: am Mac
                        gebaut, am Apple TV gefahren, im Web-Portal ausgewertet. Ohne Konto funktioniert
                        die App vollständig – dann bleibt eben alles auf dem Gerät.
                    </p>
                    <div className="platform-grid">
                        {PLATFORMS.map((platform) => (
                            <article className="card" key={platform.title}>
                                <h3>{platform.title}</h3>
                                <p className="muted">{platform.text}</p>
                            </article>
                        ))}
                    </div>
                    <figure className="wide-shot">
                        <img
                            src="/shots/tv-bibliothek.webp"
                            alt="Die Bibliothek auf dem Apple TV"
                            loading="lazy"
                        />
                        <figcaption>Dieselbe Bibliothek auf dem Apple TV</figcaption>
                    </figure>
                </section>

                <section id="konto" className="signup">
                    <div className="signup-text">
                        <h2>Konto anlegen oder anmelden</h2>
                        <p className="muted">
                            Das Konto bringt den Abgleich zwischen den Geräten und das Web-Portal. Mehr
                            nicht – hinter der Anmeldung ist keine Funktion versteckt.
                        </p>
                        <ul className="ticks">
                            <li>Programme und Ordner auf allen Geräten gleich</li>
                            <li>Gefahrene Einheiten landen im Verlauf des Portals</li>
                            <li>Eigene Programme teilen und die anderer entdecken</li>
                        </ul>
                    </div>
                    <AuthCard mode={mode} onModeChange={setMode} />
                </section>

                <footer className="bottom">
                    <span>Wattwerk – strukturiertes Indoor-Radtraining</span>
                    <span className="legal-links">
                        <Link to="/datenschutz">Datenschutz</Link>
                        <Link to="/impressum">Impressum</Link>
                    </span>
                </footer>
            </main>
        </div>
    )
}

function AuthCard({mode, onModeChange}: {mode: Mode; onModeChange: (mode: Mode) => void}) {
    const {login, register} = useAuth()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [name, setName] = useState("")
    const [mailContactAllowed, setMailContactAllowed] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    function switchTo(next: Mode) {
        onModeChange(next)
        setError(null)
    }

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
        <div className="card auth-card">
            <div className="tabs">
                <button
                    type="button"
                    className={mode === "register" ? "tab active" : "tab"}
                    onClick={() => switchTo("register")}
                >
                    Konto anlegen
                </button>
                <button
                    type="button"
                    className={mode === "login" ? "tab active" : "tab"}
                    onClick={() => switchTo("login")}
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

                <button className="primary wide" type="submit" disabled={busy}>
                    {busy ? "Einen Moment …" : mode === "register" ? "Konto anlegen" : "Anmelden"}
                </button>
            </form>
        </div>
    )
}
