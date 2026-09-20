/**
 * Der Vertrag zwischen API, Landingpage und (spaeter) der App.
 *
 * Die Typen liegen bewusst im gemeinsamen Paket und nicht im Backend: die
 * Landingpage schickt genau diese Koerper, und ein Feld umzubenennen soll auf
 * beiden Seiten gleichzeitig auffallen statt erst im Browser.
 */

export interface RegisterRequest {
    email: string
    password: string
    /** Anzeigename. Optional - wer nur schnell reinschauen will, tippt keinen Namen. */
    name?: string
    /** Einwilligung in Produktmails. Getrennt von der Registrierung selbst. */
    mailContactAllowed?: boolean
}

export interface LoginRequest {
    email: string
    password: string
}

export interface RefreshTokenRequest {
    refreshToken: string
}

export interface AuthResponse {
    user: UserResponse
    accessToken: string
    refreshToken: string
}

export interface RefreshTokenResponse {
    accessToken: string
    refreshToken: string
}

export interface UserResponse {
    id: number
    email: string
    name: string
    mailContactAllowed: boolean
    /** Schwellenleistung in Watt - die Bezugsgroesse aller Programme. */
    ftp: number
    maxHeartRate: number
    restingHeartRate: number
    weightKg: number
    createdAt: string
}

export interface UpdateProfileRequest {
    name?: string
    ftp?: number
    maxHeartRate?: number
    restingHeartRate?: number
    weightKg?: number
    mailContactAllowed?: boolean
}

/**
 * Fehler kommen immer in dieser Form zurueck, damit die Landingpage nicht
 * Zeichenketten vergleichen muss, um "E-Mail schon vergeben" von
 * "Passwort zu kurz" zu unterscheiden.
 */
export interface ApiErrorResponse {
    error: ApiErrorCode
    message: string
}

export type ApiErrorCode =
    | "INVALID_BODY"
    | "INVALID_EMAIL"
    | "WEAK_PASSWORD"
    | "EMAIL_TAKEN"
    | "INVALID_CREDENTIALS"
    | "INVALID_TOKEN"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "TOO_MANY_REQUESTS"
    | "INTERNAL"
