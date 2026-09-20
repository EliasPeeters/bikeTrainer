import {useEffect, useState} from "react"
import type {ApiKeyResponse, ApiKeyScope} from "@wattwerk/shared"
import {api, ApiError} from "../api/client"

/**
 * Zugangsschlüssel für eingetragene Verbindungen.
 *
 * Der Schlüssel steht genau einmal auf dem Bildschirm, direkt nach dem Anlegen.
 * Danach kennt der Server nur noch seinen Hash - ein zweites Mal anzeigen wäre
 * technisch unmöglich, und das ist der Punkt: ein Schlüssel, der sich jederzeit
 * nachschlagen lässt, ist so gut geschützt wie die schwächste Stelle, an der er
 * gespeichert liegt.
 */
export function ApiKeysCard() {
    const [keys, setKeys] = useState<ApiKeyResponse[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [name, setName] = useState("")
    const [scope, setScope] = useState<ApiKeyScope>("full")
    const [busy, setBusy] = useState(false)
    /** Nur im Speicher und nur bis zum nächsten Neuladen. */
    const [freshToken, setFreshToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    async function load() {
        try {
            const response = await api.apiKeys()
            setKeys(response.keys)
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Die Schlüssel ließen sich nicht laden.")
            setKeys([])
        }
    }

    useEffect(() => {
        void load()
    }, [])

    async function create(event: React.FormEvent) {
        event.preventDefault()
        setBusy(true)
        setError(null)
        setCopied(false)
        try {
            const created = await api.createApiKey({name, scope})
            setFreshToken(created.token)
            setName("")
            setScope("full")
            await load()
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Anlegen fehlgeschlagen.")
        } finally {
            setBusy(false)
        }
    }

    async function remove(key: ApiKeyResponse) {
        if (!window.confirm(`Schlüssel „${key.name}" zurücknehmen? Was ihn benutzt, hat sofort keinen Zugriff mehr.`)) {
            return
        }
        setError(null)
        try {
            await api.deleteApiKey(key.id)
            await load()
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Zurücknehmen fehlgeschlagen.")
        }
    }

    async function copy(token: string) {
        try {
            await navigator.clipboard.writeText(token)
            setCopied(true)
        } catch {
            // Ohne Zwischenablage bleibt der Schlüssel lesbar auf dem Schirm -
            // markieren und kopieren geht immer.
            setCopied(false)
        }
    }

    return (
        <section className="card block">
            <h2>Zugangsschlüssel</h2>
            <p className="muted">
                Für Programme, die in deinem Namen auf Wattwerk zugreifen – etwa der MCP-Server, mit dem
                ein Sprachmodell deine Einheiten liest und Programme anlegt. Anders als eine Anmeldung
                lässt sich ein Schlüssel einzeln zurücknehmen.
            </p>

            {error !== null && (
                <div className="message error" role="alert">
                    {error}
                </div>
            )}

            {freshToken !== null && (
                <div className="message success">
                    <strong>Jetzt kopieren – danach ist er weg.</strong>
                    <p className="muted tiny">
                        Wattwerk speichert nur eine Prüfsumme. Wer den Schlüssel verliert, legt einen neuen
                        an und nimmt den alten zurück.
                    </p>
                    <code className="token">{freshToken}</code>
                    <div className="actions">
                        <button type="button" className="ghost" onClick={() => void copy(freshToken)}>
                            {copied ? "Kopiert" : "Kopieren"}
                        </button>
                        <button type="button" className="ghost" onClick={() => setFreshToken(null)}>
                            Fertig
                        </button>
                    </div>
                </div>
            )}

            <form className="form-grid" onSubmit={create}>
                <label className="wide">
                    Wofür ist er?
                    <input
                        type="text"
                        required
                        placeholder="Claude auf dem Mac"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        disabled={busy}
                    />
                </label>
                <label>
                    Rechte
                    <select
                        value={scope}
                        onChange={(event) => setScope(event.target.value as ApiKeyScope)}
                        disabled={busy}
                    >
                        <option value="full">Lesen und schreiben</option>
                        <option value="read">Nur lesen</option>
                    </select>
                </label>
                <div className="actions wide">
                    <button type="submit" className="primary" disabled={busy || name.trim().length === 0}>
                        {busy ? "Legt an …" : "Schlüssel anlegen"}
                    </button>
                </div>
            </form>

            {keys === null ? (
                <p className="muted">Lädt …</p>
            ) : keys.length === 0 ? (
                <p className="muted">Noch keine Schlüssel.</p>
            ) : (
                <ul className="key-list">
                    {keys.map((key) => (
                        <li key={key.id}>
                            <div>
                                <strong>{key.name}</strong>
                                <p className="muted tiny">
                                    <code>{key.preview}…</code>
                                    {" · "}
                                    {key.scope === "read" ? "nur lesen" : "lesen und schreiben"}
                                    {" · "}
                                    {key.lastUsedAt === null
                                        ? "nie benutzt"
                                        : `zuletzt ${new Date(key.lastUsedAt).toLocaleDateString("de-DE")}`}
                                    {key.expiresAt !== null &&
                                        ` · läuft ab ${new Date(key.expiresAt).toLocaleDateString("de-DE")}`}
                                </p>
                            </div>
                            <button type="button" className="ghost danger" onClick={() => void remove(key)}>
                                Zurücknehmen
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
