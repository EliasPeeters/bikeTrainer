import type {
    AddToCollectionRequest,
    ApiErrorCode,
    ApiErrorResponse,
    AuthResponse,
    CollectionDTO,
    CollectionListResponse,
    DiscoveryResponse,
    RefreshTokenResponse,
    SaveCollectionRequest,
    SaveWorkoutRequest,
    TrainingSessionListResponse,
    TrainingSessionPayload,
    TrainingSessionResponse,
    UpdateProfileRequest,
    UserResponse,
    WorkoutDTO,
    WorkoutListResponse,
} from "@wattwerk/shared"
import {
    API_URL,
    Credentials,
    credentialsFromEnv,
    hasCredentials,
    REQUEST_TIMEOUT_MS,
} from "./config"

export class WattwerkApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: ApiErrorCode | "NETWORK" | "NO_CREDENTIALS",
        message: string
    ) {
        super(message)
        this.name = "WattwerkApiError"
    }
}

interface RequestOptions {
    method?: "GET" | "POST" | "PUT" | "DELETE"
    body?: unknown
    query?: Record<string, string | number | boolean | undefined>
    /** `false` schickt den Aufruf ohne Token - fuer die oeffentlichen Routen. */
    authenticated?: boolean
}

interface HealthResponse {
    status: "ok" | "degraded"
    database: "up" | "down"
    uptimeSeconds: number
}

/**
 * Die Wattwerk-API als Methoden.
 *
 * Die Anmeldung passiert beim ersten Aufruf, der sie braucht, und nicht beim
 * Start: ein MCP-Server wird vom Client oft gestartet, lange bevor jemand ein
 * Werkzeug aufruft, und ein Serverstart, der an einer schlafenden API scheitert,
 * waere nur ein Fehler ohne Adressaten.
 */
export class WattwerkClient {
    private accessToken: string | null
    private refreshToken: string | null
    /** Laeuft eine Anmeldung, warten weitere Aufrufe auf dieselbe statt eine zweite zu starten. */
    private pendingAuth: Promise<void> | null = null

    /**
     * Ohne Argument die Zugangsdaten aus der Umgebung - so laeuft der
     * stdio-Betrieb. Im HTTP-Betrieb bekommt jeder Aufruf seinen eigenen
     * Client mit dem Token aus dem Authorization-Header.
     */
    constructor(private readonly credentials: Credentials = credentialsFromEnv()) {
        this.accessToken = credentials.accessToken ?? null
        this.refreshToken = credentials.refreshToken ?? null
    }

    public get hasCredentials(): boolean {
        return hasCredentials(this.credentials)
    }

    // MARK: - Konto und Profil

    public async profile(): Promise<UserResponse> {
        return await this.call<UserResponse>("/me")
    }

    public async updateProfile(body: UpdateProfileRequest): Promise<UserResponse> {
        return await this.call<UserResponse>("/me", {method: "PUT", body})
    }

    public async health(): Promise<HealthResponse> {
        return await this.call<HealthResponse>("/health", {authenticated: false})
    }

    // MARK: - Programme

    public async ownWorkouts(): Promise<WorkoutDTO[]> {
        const response = await this.call<WorkoutListResponse>("/workouts")
        return response.workouts
    }

    public async publicWorkouts(query: {
        query?: string
        tag?: string
        minDurationSeconds?: number
        maxDurationSeconds?: number
        limit?: number
    }): Promise<WorkoutDTO[]> {
        const response = await this.call<WorkoutListResponse>("/workouts/public", {
            authenticated: false,
            query,
        })
        return response.workouts
    }

    /**
     * Mit Token, obwohl die Route ohne geht: nur dann liefert sie auch die
     * eigenen privaten Programme statt 404.
     */
    public async workout(id: string): Promise<WorkoutDTO> {
        return await this.call<WorkoutDTO>(`/workouts/${encodeURIComponent(id)}`, {
            authenticated: this.hasCredentials,
        })
    }

    public async saveWorkout(body: SaveWorkoutRequest): Promise<WorkoutDTO> {
        return await this.call<WorkoutDTO>("/workouts", {method: "POST", body})
    }

    public async updateWorkout(id: string, body: SaveWorkoutRequest): Promise<WorkoutDTO> {
        return await this.call<WorkoutDTO>(`/workouts/${encodeURIComponent(id)}`, {
            method: "PUT",
            body,
        })
    }

    public async deleteWorkout(id: string): Promise<{deleted: boolean}> {
        return await this.call<{deleted: boolean}>(`/workouts/${encodeURIComponent(id)}`, {
            method: "DELETE",
        })
    }

    public async syncWorkouts(workouts: SaveWorkoutRequest[]): Promise<WorkoutDTO[]> {
        const response = await this.call<WorkoutListResponse>("/workouts/sync", {
            method: "POST",
            body: {workouts},
        })
        return response.workouts
    }

    // MARK: - Bibliothek

    public async discover(): Promise<DiscoveryResponse> {
        return await this.call<DiscoveryResponse>("/discover", {authenticated: this.hasCredentials})
    }

    // MARK: - Sammlungen

    public async collections(): Promise<CollectionDTO[]> {
        const response = await this.call<CollectionListResponse>("/collections")
        return response.collections
    }

    public async createCollection(body: SaveCollectionRequest): Promise<CollectionDTO> {
        return await this.call<CollectionDTO>("/collections", {method: "POST", body})
    }

    public async updateCollection(id: string, body: SaveCollectionRequest): Promise<CollectionDTO> {
        return await this.call<CollectionDTO>(`/collections/${encodeURIComponent(id)}`, {
            method: "PUT",
            body,
        })
    }

    public async deleteCollection(id: string): Promise<{deleted: boolean}> {
        return await this.call<{deleted: boolean}>(`/collections/${encodeURIComponent(id)}`, {
            method: "DELETE",
        })
    }

    public async addToCollection(id: string, workoutID: string): Promise<CollectionDTO> {
        const body: AddToCollectionRequest = {workoutID}
        return await this.call<CollectionDTO>(`/collections/${encodeURIComponent(id)}/items`, {
            method: "POST",
            body,
        })
    }

    public async removeFromCollection(id: string, workoutID: string): Promise<CollectionDTO> {
        return await this.call<CollectionDTO>(
            `/collections/${encodeURIComponent(id)}/items/${encodeURIComponent(workoutID)}`,
            {method: "DELETE"}
        )
    }

    // MARK: - Gefahrene Einheiten

    public async sessions(limit?: number): Promise<TrainingSessionListResponse> {
        return await this.call<TrainingSessionListResponse>("/sessions", {query: {limit}})
    }

    public async createSession(body: TrainingSessionPayload): Promise<TrainingSessionResponse> {
        return await this.call<TrainingSessionResponse>("/sessions", {method: "POST", body})
    }

    public async deleteSession(id: number): Promise<{deleted: boolean}> {
        return await this.call<{deleted: boolean}>(`/sessions/${id}`, {method: "DELETE"})
    }

    // MARK: - Ausfuehrung

    /**
     * Ein abgelaufenes Zugangstoken wird genau einmal erneuert und der Aufruf
     * wiederholt. Scheitert auch der zweite Versuch, sind die Zugangsdaten
     * wirklich hinueber - eine Schleife aus Anmelden und Scheitern wuerde nur
     * die Ratenbegrenzung der API auslaesen.
     */
    private async call<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const authenticated = options.authenticated ?? true

        if (authenticated) {
            if (!this.hasCredentials) {
                throw new WattwerkApiError(0, "NO_CREDENTIALS", this.missingCredentialsHint())
            }
            await this.ensureToken()
        }

        const response = await this.send(path, options, authenticated)

        if (response.status === 401 && authenticated) {
            this.accessToken = null
            await this.ensureToken()
            return await this.unwrap<T>(await this.send(path, options, true))
        }

        return await this.unwrap<T>(response)
    }

    private async send(
        path: string,
        options: RequestOptions,
        authenticated: boolean
    ): Promise<Response> {
        const headers: Record<string, string> = {accept: "application/json"}
        if (options.body !== undefined) {
            headers["content-type"] = "application/json"
        }
        if (authenticated && this.accessToken !== null) {
            headers["authorization"] = `Bearer ${this.accessToken}`
        }

        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value !== undefined) {
                query.set(key, String(value))
            }
        }
        const suffix = query.toString().length > 0 ? `?${query.toString()}` : ""

        try {
            return await fetch(`${API_URL}${path}${suffix}`, {
                method: options.method ?? "GET",
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            throw new WattwerkApiError(
                0,
                "NETWORK",
                `Die API unter ${API_URL} ist nicht erreichbar (${reason}).`
            )
        }
    }

    private async unwrap<T>(response: Response): Promise<T> {
        const text = await response.text()
        const parsed = text.length > 0 ? safeParse(text) : null

        if (!response.ok) {
            const error = parsed as ApiErrorResponse | null
            throw new WattwerkApiError(
                response.status,
                error?.error ?? "INTERNAL",
                error?.message ?? `${response.status} ${response.statusText}`
            )
        }

        return parsed as T
    }

    /** Besorgt ein Zugangstoken, falls keins da ist. */
    private async ensureToken(): Promise<void> {
        if (this.accessToken !== null) {
            return
        }
        // Mehrere gleichzeitige Werkzeugaufrufe sollen sich nicht gegenseitig
        // durch die Ratenbegrenzung der Anmelderoute schieben.
        this.pendingAuth = this.pendingAuth ?? this.authenticate().finally(() => {
            this.pendingAuth = null
        })
        await this.pendingAuth
    }

    private async authenticate(): Promise<void> {
        const {email, password} = this.credentials
        const canFallBackToPassword = email !== undefined && password !== undefined

        if (this.refreshToken !== null) {
            try {
                const refreshed = await this.unwrap<RefreshTokenResponse>(
                    await this.send(
                        "/auth/refresh",
                        {method: "POST", body: {refreshToken: this.refreshToken}},
                        false
                    )
                )
                this.accessToken = refreshed.accessToken
                this.refreshToken = refreshed.refreshToken
                return
            } catch (error) {
                // Mit Passwort in der Hand ist ein verbrauchtes Auffrischungstoken
                // kein Grund aufzugeben.
                if (!canFallBackToPassword) {
                    throw new WattwerkApiError(401, "INVALID_TOKEN", this.badTokenHint())
                }
                this.refreshToken = null
            }
        }

        if (!canFallBackToPassword) {
            throw new WattwerkApiError(401, "UNAUTHORIZED", this.badTokenHint())
        }

        const auth = await this.unwrap<AuthResponse>(
            await this.send("/auth/login", {method: "POST", body: {email, password}}, false)
        )
        this.accessToken = auth.accessToken
        this.refreshToken = auth.refreshToken
    }

    /** Der Hinweis haengt daran, wo der Aufrufer nachsehen muss. */
    private missingCredentialsHint(): string {
        return this.credentials.source === "header"
            ? "Dafuer braucht es ein Konto. Schicke das Auffrischungstoken als " +
                  "\"Authorization: Bearer <refreshToken>\" mit."
            : "Dafuer braucht es ein Konto. Setze WATTWERK_EMAIL und WATTWERK_PASSWORD " +
                  "(oder WATTWERK_REFRESH_TOKEN) in der Konfiguration des MCP-Servers."
    }

    private badTokenHint(): string {
        return this.credentials.source === "header"
            ? "Das mitgeschickte Token wird nicht angenommen. Erwartet wird ein " +
                  "Auffrischungstoken - der refreshToken aus POST /auth/login, nicht der accessToken."
            : "Das hinterlegte Token gilt nicht mehr und es liegt kein Passwort vor. " +
                  "Setze WATTWERK_EMAIL und WATTWERK_PASSWORD."
    }
}

function safeParse(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return {message: text}
    }
}
