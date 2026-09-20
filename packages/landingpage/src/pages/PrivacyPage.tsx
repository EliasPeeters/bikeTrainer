import {Link} from "react-router-dom"

/**
 * Datenschutzerklärung.
 *
 * App Store Connect verlangt vor dem Einreichen eine erreichbare Adresse. Der
 * Inhalt beschreibt, was die Anwendung tatsächlich tut, und muss deckungsgleich
 * mit `PrivacyInfo.xcprivacy` und dem Fragebogen in App Store Connect sein -
 * weichen die drei voneinander ab, fällt es bei der Prüfung auf.
 *
 * Die markierten Stellen sind keine Entscheidungen, die Software treffen kann:
 * Anschrift, Hoster und Aufbewahrungsfristen muss der Betreiber eintragen.
 */
export function PrivacyPage() {
    return (
        <div className="page legal">
            <header className="top">
                <Link to="/" className="logo">
                    <img className="logo-mark" src="/icon-180.png" alt="" />
                    Wattwerk
                </Link>
            </header>

            <h1>Datenschutz</h1>
            <p className="muted">Stand: September 2026</p>

            <p className="todo">
                <strong>Noch einzutragen:</strong> Name und Anschrift des Verantwortlichen,
                Kontakt-E-Mail, Hoster samt Serverstandort. Ohne diese Angaben ist die Erklärung
                nicht vollständig. Ich bin kein Anwalt – lass den Text prüfen, bevor die App
                öffentlich wird.
            </p>

            <h2>Ohne Konto verlässt nichts dein Gerät</h2>
            <p>
                Wattwerk funktioniert vollständig ohne Anmeldung. Programme, gefahrene Einheiten und
                dein Fahrerprofil liegen dann ausschließlich auf deinem Gerät. Es werden keine Daten
                an einen Server übertragen, es gibt keine Analyse-Werkzeuge und keine Werbung.
            </p>

            <h2>Mit Konto</h2>
            <p>Legst du ein Konto an, werden folgende Daten auf unserem Server verarbeitet:</p>
            <ul>
                <li>
                    <strong>E-Mail-Adresse</strong> – als Anmeldename. Das Passwort wird nie im
                    Klartext gespeichert, sondern nur als bcrypt-Hash.
                </li>
                <li>
                    <strong>Anzeigename</strong> – freiwillig, erscheint an Programmen, die du
                    öffentlich teilst.
                </li>
                <li>
                    <strong>Fahrerprofil</strong> – Schwellenleistung, Maximal- und Ruhepuls,
                    Körpergewicht.
                </li>
                <li>
                    <strong>Gefahrene Einheiten</strong> – Datum, Dauer, Leistung, Trittfrequenz,
                    Herzfrequenz und die daraus errechneten Kennzahlen. Der Verlauf Sekunde für
                    Sekunde bleibt auf dem Gerät und wird nicht übertragen.
                </li>
                <li>
                    <strong>Programme und Ordner</strong>, die du anlegst.
                </li>
            </ul>
            <p>
                Herzfrequenz, Gewicht und Trainingsdaten sind Gesundheits- und Fitnessdaten. Sie
                werden ausschließlich dafür verarbeitet, dir deine eigenen Auswertungen zu zeigen
                und sie zwischen deinen Geräten abzugleichen. Rechtsgrundlage ist die Erfüllung des
                Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO) und deine Einwilligung durch das
                Anlegen des Kontos (Art. 9 Abs. 2 lit. a DSGVO).
            </p>

            <h2>Was nicht passiert</h2>
            <ul>
                <li>Keine Weitergabe an Dritte, kein Verkauf, keine Werbenetzwerke.</li>
                <li>Kein Tracking über Apps oder Webseiten hinweg.</li>
                <li>Keine automatisierte Entscheidungsfindung, kein Profiling zu Werbezwecken.</li>
                <li>Keine Cookies zu Analysezwecken. Die Anmeldung merkt sich ein Token im
                    lokalen Speicher deines Browsers – nur dafür, dass du angemeldet bleibst.</li>
            </ul>

            <h2>Öffentlich geteilte Programme</h2>
            <p>
                Programme sind privat, bis du sie selbst freigibst. Ein freigegebenes Programm ist
                für alle sichtbar, zusammen mit deinem Anzeigenamen. Du kannst es jederzeit wieder
                auf privat stellen.
            </p>

            <h2>Server-Protokolle</h2>
            <p>
                Der Server schreibt für jeden Aufruf Methode, Pfad, Statuscode und Dauer mit. Die
                IP-Adresse wird zur Begrenzung von Anmeldeversuchen im Arbeitsspeicher gezählt und
                nicht dauerhaft gespeichert.
            </p>

            <h2>Dein Konto löschen</h2>
            <p>
                In der App unter <em>Konto</em>, im Portal unter <em>Profil</em>. Die Löschung
                erfolgt sofort und umfasst alle Einheiten, Programme und Ordner – auch öffentlich
                geteilte. Sie lässt sich nicht rückgängig machen. Daten, die nur auf deinem Gerät
                liegen, bleiben dort, bis du die App entfernst.
            </p>

            <h2>Deine Rechte</h2>
            <p>
                Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                Datenübertragbarkeit und Widerspruch nach Art. 15 bis 21 DSGVO. Außerdem steht dir
                ein Beschwerderecht bei einer Aufsichtsbehörde zu. Für Auskunft und Ausfuhr genügt
                eine Nachricht an die oben genannte Adresse.
            </p>

            <footer className="bottom">
                <Link to="/">Zurück zur Startseite</Link>
            </footer>
        </div>
    )
}
