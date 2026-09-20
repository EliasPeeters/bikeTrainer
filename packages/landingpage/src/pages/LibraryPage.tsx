import type {CollectionDTO, DiscoveryResponse, WorkoutDTO} from "@wattwerk/shared"
import {useCallback, useEffect, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {api, ApiError} from "../api/client"
import {WorkoutCard} from "../components/WorkoutCard"
import {WorkoutRow} from "../components/WorkoutRow"

export function LibraryPage() {
    const navigate = useNavigate()
    const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null)
    const [collections, setCollections] = useState<CollectionDTO[]>([])
    const [search, setSearch] = useState("")
    const [results, setResults] = useState<WorkoutDTO[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        try {
            const rows = await api.discover()
            setDiscovery(rows)
            setCollections(rows.collections)
        } catch {
            setError("Die Bibliothek konnte nicht geladen werden.")
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    async function runSearch(event: React.FormEvent) {
        event.preventDefault()
        if (search.trim().length === 0) {
            setResults(null)
            return
        }
        try {
            const found = await api.publicWorkouts({query: search.trim(), limit: 50})
            setResults(found.workouts)
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Die Suche ist fehlgeschlagen.")
        }
    }

    async function createCollection() {
        const name = window.prompt("Wie soll der Ordner heißen?")
        if (name === null || name.trim().length === 0) {
            return
        }
        try {
            await api.saveCollection({name: name.trim()})
            await reload()
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Der Ordner konnte nicht angelegt werden.")
        }
    }

    async function removeCollection(collection: CollectionDTO) {
        if (!window.confirm(`„${collection.name}“ wirklich löschen? Die Programme bleiben erhalten.`)) {
            return
        }
        await api.deleteCollection(collection.id)
        await reload()
    }

    return (
        <>
            <div className="section-head">
                <div>
                    <h1>Bibliothek</h1>
                    <p className="muted">Deine Programme, deine Ordner und was andere geteilt haben.</p>
                </div>
                <Link className="primary button" to="/app/programm/neu">
                    Programm erstellen
                </Link>
            </div>

            {error !== null && <div className="message error">{error}</div>}

            <form className="search" onSubmit={runSearch}>
                <input
                    type="search"
                    placeholder="Öffentliche Programme durchsuchen …"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <button type="submit" className="ghost">
                    Suchen
                </button>
                {results !== null && (
                    <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                            setResults(null)
                            setSearch("")
                        }}
                    >
                        Zurücksetzen
                    </button>
                )}
            </form>

            {results !== null ? (
                <section className="block">
                    <h2>
                        {results.length} Treffer für „{search}“
                    </h2>
                    {results.length === 0 ? (
                        <p className="muted">Dazu gibt es nichts Öffentliches.</p>
                    ) : (
                        <div className="grid">
                            {results.map((workout) => (
                                <WorkoutCard
                                    key={workout.id}
                                    workout={workout}
                                    onClick={() => navigate(`/app/programm/${workout.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <>
                    <section className="block">
                        <div className="section-head small">
                            <h2>Deine Ordner</h2>
                            <button type="button" className="ghost" onClick={createCollection}>
                                Neuer Ordner
                            </button>
                        </div>
                        {collections.length === 0 ? (
                            <p className="muted">
                                Noch keine Ordner. Sie funktionieren wie Playlists: Programme hineinlegen,
                                der Reihe nach abfahren.
                            </p>
                        ) : (
                            <div className="collection-grid">
                                {collections.map((collection) => (
                                    <article className="card collection" key={collection.id}>
                                        <header>
                                            <h3>{collection.name}</h3>
                                            <button
                                                type="button"
                                                className="ghost tiny"
                                                onClick={() => removeCollection(collection)}
                                            >
                                                Löschen
                                            </button>
                                        </header>
                                        <p className="muted tiny">
                                            {collection.workouts.length === 0
                                                ? "Noch leer"
                                                : `${collection.workouts.length} Programme`}
                                        </p>
                                        <div className="row-scroller tight">
                                            {collection.workouts.map((workout) => (
                                                <WorkoutCard
                                                    key={workout.id}
                                                    workout={workout}
                                                    compact
                                                    onClick={() => navigate(`/app/programm/${workout.id}`)}
                                                />
                                            ))}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {discovery === null ? (
                        <p className="muted">Wird geladen …</p>
                    ) : (
                        discovery.rows.map((row) => (
                            <WorkoutRow
                                key={row.key}
                                title={row.title}
                                subtitle={row.subtitle}
                                workouts={row.workouts}
                                onSelect={(workout) => navigate(`/app/programm/${workout.id}`)}
                            />
                        ))
                    )}
                </>
            )}
        </>
    )
}
