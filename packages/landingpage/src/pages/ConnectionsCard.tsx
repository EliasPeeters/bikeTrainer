import {useEffect, useState} from "react"
import type {ConnectionResponse} from "@wattwerk/shared"
import {api, ApiError} from "../api/client"

/**
 * Anwendungen, denen jemand über OAuth Zugriff erlaubt hat.
 *
 * Eigene Karte neben den Zugangsschlüsseln, obwohl beides Zugänge sind: ein
 * Schlüssel entsteht hier, eine Verbindung entsteht drüben bei der Anwendung.
 * Sie in eine Liste zu werfen hieße, zwei verschiedene Fragen ("was habe ich
 * angelegt?" und "wem habe ich erlaubt?") mit derselben Tabelle zu beantworten.
 */
export function ConnectionsCard() {
    const [connections, setConnections] = useState<ConnectionResponse[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function load() {
        try {
            const response = await api.connections()
            setConnections(response.connections)
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Die Verbindungen ließen sich nicht laden.")
            setConnections([])
        }
    }

    useEffect(() => {
        void load()
    }, [])

    async function remove(connection: ConnectionResponse) {
        if (
            !window.confirm(
                `Verbindung zu „${connection.clientName}" trennen? Die Anwendung hat danach sofort keinen Zugriff mehr.`
            )
        ) {
            return
        }
        setError(null)
        try {
            await api.deleteConnection(connection.id)
            await load()
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Trennen fehlgeschlagen.")
        }
    }

    // Eine leere Liste ist hier keine Nachricht wert: wer nie etwas verbunden
    // hat, braucht die Karte nicht.
    if (connections !== null && connections.length === 0 && error === null) {
        return null
    }

    return (
        <section className="card block">
            <h2>Verbundene Anwendungen</h2>
            <p className="muted">
                Anwendungen, denen du über „Verbinden" Zugriff auf dein Konto erlaubt hast – etwa ChatGPT
                oder Claude. Trennen wirkt sofort.
            </p>

            {error !== null && (
                <div className="message error" role="alert">
                    {error}
                </div>
            )}

            {connections === null ? (
                <p className="muted">Lädt …</p>
            ) : (
                <ul className="key-list">
                    {connections.map((connection) => (
                        <li key={connection.id}>
                            <div>
                                <strong>{connection.clientName}</strong>
                                <p className="muted tiny">
                                    {connection.scope.includes("wattwerk:write")
                                        ? "lesen und schreiben"
                                        : "nur lesen"}
                                    {" · "}
                                    verbunden seit{" "}
                                    {new Date(connection.createdAt).toLocaleDateString("de-DE")}
                                    {connection.lastUsedAt !== null &&
                                        ` · zuletzt ${new Date(connection.lastUsedAt).toLocaleDateString("de-DE")}`}
                                </p>
                            </div>
                            <button type="button" className="ghost danger" onClick={() => void remove(connection)}>
                                Trennen
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
