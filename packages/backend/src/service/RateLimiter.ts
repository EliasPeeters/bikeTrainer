/**
 * Gleitendes Zeitfenster pro Schluessel, im Arbeitsspeicher.
 *
 * Die Anmelderouten sind die einzigen, die ohne Token erreichbar sind, und
 * damit die einzigen, an denen jemand Passwoerter durchprobieren kann. Ein
 * Limit im Prozess haelt das auf, ohne Redis und ohne weitere Abhaengigkeit.
 *
 * Grenze: das Limit gilt je Prozess. Laufen mehrere Instanzen hinter einem
 * Load Balancer, vervielfacht sich das erlaubte Kontingent entsprechend. Fuer
 * eine echte Sperre gehoert der Zaehler in einen gemeinsamen Speicher - bis
 * dahin ist das hier eine Bremse, keine Mauer.
 */
export class RateLimiter {
    private hits = new Map<string, number[]>()

    constructor(
        private readonly limit: number,
        private readonly windowMs: number
    ) {}

    /** `true`, wenn der Aufruf durchgehen darf. */
    public check(key: string, now: number = Date.now()): boolean {
        const cutoff = now - this.windowMs
        const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff)

        if (recent.length >= this.limit) {
            // Der abgelehnte Versuch wird nicht mitgezaehlt: sonst verlaengert
            // stures Weiterprobieren die Sperre endlos.
            this.hits.set(key, recent)
            return false
        }

        recent.push(now)
        this.hits.set(key, recent)
        return true
    }

    /**
     * Raeumt Schluessel weg, deren Fenster abgelaufen ist. Ohne das waechst die
     * Map mit jeder je gesehenen IP.
     */
    public cleanup(now: number = Date.now()) {
        const cutoff = now - this.windowMs
        for (const [key, timestamps] of this.hits) {
            const recent = timestamps.filter((timestamp) => timestamp > cutoff)
            if (recent.length === 0) {
                this.hits.delete(key)
            } else {
                this.hits.set(key, recent)
            }
        }
    }

    public get size(): number {
        return this.hits.size
    }
}
