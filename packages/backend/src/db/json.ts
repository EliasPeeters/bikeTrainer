/**
 * MariaDB meldet JSON-Spalten als LONGTEXT, nicht als JSON.
 *
 * Deshalb entscheidet der Treiber je nach Server, ob er den Wert bereits
 * geparst zurückgibt oder als Zeichenkette. Beides hier abzufangen ist billiger
 * als ein Fehler, der nur auf einer der beiden Datenbanken auftritt.
 */
export function parseJSONColumn<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) {
        return fallback
    }
    if (typeof value === "string") {
        try {
            return JSON.parse(value) as T
        } catch {
            return fallback
        }
    }
    return value as T
}
