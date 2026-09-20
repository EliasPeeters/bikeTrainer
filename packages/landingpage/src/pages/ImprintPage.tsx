import {Link} from "react-router-dom"

/**
 * Impressum nach § 5 DDG.
 *
 * Wattwerk wird privat betrieben, nicht von einer Firma - deshalb gibt es
 * weder Handelsregister noch Umsatzsteuer-Identifikationsnummer. Was bleibt,
 * ist die Pflichtangabe, die das Gesetz auch Privatleuten abverlangt, sobald
 * ein Dienst öffentlich angeboten wird: Name, ladungsfähige Anschrift und ein
 * Weg zur schnellen elektronischen Kontaktaufnahme.
 *
 * Die Seite muss ohne Anmeldung erreichbar sein und von jeder anderen Seite
 * aus in höchstens zwei Schritten - darum steht der Verweis im Fuß und in der
 * Menüleiste.
 */
export function ImprintPage() {
    return (
        <div className="page legal">
            <header className="top">
                <Link to="/" className="logo">
                    <img className="logo-mark" src="/icon-180.png" alt="" />
                    Wattwerk
                </Link>
            </header>

            <h1>Impressum</h1>
            <p className="muted">Angaben gemäß § 5 DDG</p>

            <h2>Anbieter</h2>
            <address className="contact">
                Elias Peeters
                <br />
                Kedenburgstraße 50
                <br />
                22041 Hamburg
                <br />
                Deutschland
            </address>

            <h2>Kontakt</h2>
            <address className="contact">
                Telefon: <a href="tel:+491723445175">+49 172 3445175</a>
                <br />
                E-Mail: <a href="mailto:contact@eliaspeeters.de">contact@eliaspeeters.de</a>
            </address>

            <h2>Verantwortlich für den Inhalt</h2>
            <p>
                Elias Peeters, Anschrift wie oben (§ 18 Abs. 2 MStV).
            </p>

            <h2>Umsatzsteuer</h2>
            <p>
                Wattwerk wird privat und ohne Gewinnerzielungsabsicht betrieben. Es besteht keine
                Umsatzsteuer-Identifikationsnummer nach § 27 a Umsatzsteuergesetz und kein Eintrag
                in einem Handels-, Vereins- oder Genossenschaftsregister.
            </p>

            <h2>Streitbeilegung</h2>
            <p>
                Zur Teilnahme an einem Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle bin ich weder verpflichtet noch bereit.
            </p>

            <h2>Haftung für Inhalte und Verweise</h2>
            <p>
                Für eigene Inhalte auf diesen Seiten bin ich nach den allgemeinen Gesetzen
                verantwortlich. Programme, die Nutzerinnen und Nutzer selbst anlegen und öffentlich
                teilen, sind fremde Inhalte: Sie werden nicht vorab geprüft. Wird mir eine
                Rechtsverletzung bekannt, entferne ich den betreffenden Inhalt umgehend. Dasselbe
                gilt für Verweise auf fremde Seiten, auf deren Inhalt ich keinen Einfluss habe.
            </p>

            <h2>Datenschutz</h2>
            <p>
                Wie Wattwerk mit deinen Daten umgeht, steht in der{" "}
                <Link to="/datenschutz">Datenschutzerklärung</Link>.
            </p>

            <footer className="bottom">
                <Link to="/">Zurück zur Startseite</Link>
            </footer>
        </div>
    )
}
