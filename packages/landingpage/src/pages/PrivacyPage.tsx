import {Link} from "react-router-dom"

/**
 * Datenschutzerklärung.
 *
 * App Store Connect verlangt vor dem Einreichen eine erreichbare Adresse. Der
 * Inhalt beschreibt, was die Anwendung tatsächlich tut, und muss deckungsgleich
 * mit `PrivacyInfo.xcprivacy` und dem Fragebogen in App Store Connect sein -
 * weichen die drei voneinander ab, fällt es bei der Prüfung auf.
 *
 * Wenn sich am Backend etwas ändert, was gespeichert wird, gehört die Änderung
 * hierher: die Liste unter „Mit Konto" ist die Tabellenstruktur in Worten.
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

            <h2>Verantwortlicher</h2>
            <address className="contact">
                Elias Peeters
                <br />
                Kedenburgstraße 50
                <br />
                22041 Hamburg
                <br />
                Deutschland
                <br />
                Telefon: <a href="tel:+491723445175">+49 172 3445175</a>
                <br />
                E-Mail: <a href="mailto:contact@eliaspeeters.de">contact@eliaspeeters.de</a>
            </address>
            <p>
                Weitere Angaben zum Anbieter stehen im <Link to="/impressum">Impressum</Link>. Einen
                Datenschutzbeauftragten gibt es nicht; Wattwerk wird privat betrieben und erreicht
                die Schwellen des § 38 BDSG nicht.
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
                <li>
                    <strong>Zeitpunkt der letzten Anmeldung</strong> sowie Anlage- und
                    Änderungszeitpunkt der genannten Einträge.
                </li>
                <li>
                    <strong>Zugangsschlüssel und Anbindungen</strong> – Name, den du dem Schlüssel
                    gibst, die letzten Zeichen zum Wiedererkennen, Ablauf und der Zeitpunkt der
                    letzten Benutzung. Der Schlüssel selbst wird nur als Hash gespeichert und ist
                    nach dem Anlegen nicht wieder anzeigbar.
                </li>
                <li>
                    <strong>Einwilligung in Produktmails</strong> – ja oder nein, samt der
                    Möglichkeit, das jederzeit im Profil zu ändern.
                </li>
            </ul>
            <p>
                Herzfrequenz, Gewicht und Trainingsdaten sind Gesundheits- und Fitnessdaten. Sie
                werden ausschließlich dafür verarbeitet, dir deine eigenen Auswertungen zu zeigen
                und sie zwischen deinen Geräten abzugleichen. Rechtsgrundlage ist die Erfüllung des
                Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO) und deine Einwilligung durch das
                Anlegen des Kontos (Art. 9 Abs. 2 lit. a DSGVO). Die Einwilligung kannst du
                jederzeit widerrufen, indem du dein Konto löschst; die Rechtmäßigkeit der bis dahin
                erfolgten Verarbeitung bleibt davon unberührt.
            </p>

            <h2>Produktmails</h2>
            <p>
                Beim Anlegen des Kontos kannst du einwilligen, dass ich dich gelegentlich per
                E-Mail zum Stand des Projekts anschreibe. Das ist freiwillig, kein Konto hängt
                davon ab, und im Portal unter <em>Profil</em> lässt sich die Einwilligung mit einem
                Klick zurücknehmen (Art. 6 Abs. 1 lit. a DSGVO).
            </p>

            <h2>Zugangsschlüssel und Sprachmodelle</h2>
            <p>
                Du kannst im Portal Zugangsschlüssel anlegen oder einem Programm über OAuth Zugriff
                auf dein Konto geben – etwa einem Sprachmodell, das deine Programme über den
                MCP-Server liest und schreibt. Jede Anbindung siehst du in der Liste deiner
                Schlüssel und kannst sie einzeln zurücknehmen; danach ist sie sofort unbrauchbar.
            </p>
            <p>
                Wichtig zu wissen: Ein solches Programm läuft nicht bei mir. Was es mit den
                abgerufenen Daten tut und wohin es sie überträgt, richtet sich nach dessen eigener
                Datenschutzerklärung – bei einem Sprachmodell also nach der seines Anbieters. Die
                Entscheidung, eine Anbindung zu erlauben, triffst du bewusst auf einer
                Bestätigungsseite; Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a
                DSGVO).
            </p>

            <h2>Was nicht passiert</h2>
            <ul>
                <li>Keine Weitergabe an Dritte, kein Verkauf, keine Werbenetzwerke.</li>
                <li>Kein Tracking über Apps oder Webseiten hinweg.</li>
                <li>Keine automatisierte Entscheidungsfindung, kein Profiling zu Werbezwecken.</li>
                <li>Keine Übermittlung in Länder außerhalb der Europäischen Union.</li>
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
                nicht dauerhaft gespeichert. Rechtsgrundlage ist das berechtigte Interesse am
                sicheren und störungsfreien Betrieb (Art. 6 Abs. 1 lit. f DSGVO).
            </p>

            <h2>Hosting</h2>
            <p>
                Server und Datenbank laufen auf einem Server der
                <br />
                netcup GmbH, Daimlerstraße 25, 76185 Karlsruhe, Deutschland.
            </p>
            <p>
                netcup verarbeitet die Daten ausschließlich in meinem Auftrag und an meine Weisung
                gebunden; über einen Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Die Daten
                werden ausschließlich in Rechenzentren innerhalb der Europäischen Union verarbeitet;
                eine Übermittlung in Drittländer findet nicht statt.
            </p>

            <h2>Bezug der Apps</h2>
            <p>
                Die Apps für Mac und Apple TV werden über den App Store vertrieben. Beim Laden und
                Aktualisieren verarbeitet Apple Daten – etwa Apple-Konto, Gerät und Zeitpunkt –
                eigenverantwortlich und außerhalb meines Einflusses. Es gilt die
                Datenschutzerklärung von Apple. Wattwerk selbst überträgt beim Start nichts an
                Apple.
            </p>

            <h2>Wie lange gespeichert wird</h2>
            <ul>
                <li>
                    <strong>Kontodaten, Einheiten, Programme und Ordner</strong> bleiben, solange
                    das Konto besteht. Löschst du es, sind sie sofort weg.
                </li>
                <li>
                    <strong>Zugangsschlüssel und Anbindungen</strong> bis zu ihrem Ablauf oder bis
                    du sie zurücknimmst.
                </li>
                <li>
                    <strong>Server-Protokolle</strong> laufen in Dateien fester Größe und
                    überschreiben sich fortlaufend selbst; spätestens mit der nächsten Auslieferung
                    sind sie weg.
                </li>
                <li>
                    <strong>Anmeldetokens</strong> laufen von selbst ab – das Zugangstoken nach
                    Minuten, das Auffrischungstoken nach 90 Tagen.
                </li>
            </ul>

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
                Datenübertragbarkeit und Widerspruch nach Art. 15 bis 21 DSGVO. Für Auskunft und
                Ausfuhr genügt eine Nachricht an{" "}
                <a href="mailto:contact@eliaspeeters.de">contact@eliaspeeters.de</a>.
            </p>
            <p>
                Außerdem steht dir ein Beschwerderecht bei einer Aufsichtsbehörde zu. Für mich
                zuständig ist:
            </p>
            <address className="contact">
                Der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit
                <br />
                Ludwig-Erhard-Straße 22, 20459 Hamburg
                <br />
                <a href="https://datenschutz-hamburg.de" target="_blank" rel="noreferrer">
                    datenschutz-hamburg.de
                </a>
            </address>

            <h2>Änderungen</h2>
            <p>
                Ändert sich, was Wattwerk verarbeitet, ändert sich diese Erklärung mit. Der Stand
                oben sagt dir, welche Fassung du gerade liest.
            </p>

            <footer className="bottom">
                <Link to="/">Zurück zur Startseite</Link>
                <Link to="/impressum">Impressum</Link>
            </footer>
        </div>
    )
}
