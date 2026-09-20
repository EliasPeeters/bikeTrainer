/**
 * Eingabepruefung als reine Funktionen - ohne Express, ohne Datenbank, damit
 * die Regeln einzeln testbar sind.
 */

export const MIN_PASSWORD_LENGTH = 8

/**
 * bcrypt betrachtet nur die ersten 72 Bytes des Passworts und schneidet den
 * Rest stillschweigend ab. Zwei Passwoerter, die sich erst danach
 * unterscheiden, waeren also dasselbe Passwort. Statt das zu verschweigen,
 * lehnt die Registrierung zu lange Passwoerter mit einer klaren Meldung ab.
 */
export const MAX_PASSWORD_BYTES = 72

export const MAX_NAME_LENGTH = 120

/**
 * Keine vollstaendige RFC-5322-Pruefung, und das ist Absicht: der einzige
 * verlaessliche Test einer Adresse ist die Mail, die ankommt. Hier wird nur
 * aussortiert, was sicher keine Adresse ist.
 */
export function isValidEmail(email: string): boolean {
    const trimmed = email.trim()
    if (trimmed.length === 0 || trimmed.length > 255) {
        return false
    }
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed)
}

/** `null`, wenn das Passwort in Ordnung ist - sonst der Grund fuer den Nutzer. */
export function passwordIssue(password: string): string | null {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`
    }
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
        return `Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Bytes lang sein.`
    }
    return null
}

export function sanitizeName(name: unknown): string {
    if (typeof name !== "string") {
        return ""
    }
    return name.trim().slice(0, MAX_NAME_LENGTH)
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0
}

/** Zahlen aus dem Netz sind erst einmal alles Moegliche. */
export function optionalIntInRange(value: unknown, min: number, max: number): number | null | undefined {
    if (value === undefined) {
        return undefined
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null
    }
    const rounded = Math.round(value)
    if (rounded < min || rounded > max) {
        return null
    }
    return rounded
}

export function optionalNumberInRange(value: unknown, min: number, max: number): number | null | undefined {
    if (value === undefined) {
        return undefined
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        return null
    }
    return value
}
