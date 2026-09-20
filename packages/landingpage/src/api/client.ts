import type {
    ApiErrorResponse,
    AuthResponse,
    CollectionDTO,
    CollectionListResponse,
    DiscoveryResponse,
    LoginRequest,
    RefreshTokenResponse,
    RegisterRequest,
    SaveCollectionRequest,
    SaveWorkoutRequest,
    TrainingSessionListResponse,
    UpdateProfileRequest,
    UserResponse,
    WorkoutDTO,
    WorkoutListResponse,
} from "@wattwerk/shared"

/**
 * Alle Aufrufe gehen relativ an `/api`.
 *
 * Im Container leitet nginx das an die API weiter, im Entwicklungsmodus der
 * Vite-Proxy. Dadurch steht nirgends eine Adresse im gebauten JavaScript - und
 * der Stack läuft gegen jede API, ohne neu gebaut zu werden.
 */
const API_BASE = "/api"

const ACCESS_TOKEN_KEY = "wattwerk.accessToken"
const REFRESH_TOKEN_KEY = "wattwerk.refreshToken"

export class ApiError extends Error {
    constructor(
        public readonly code: ApiErrorResponse["error"],
        message: string,
        public readonly status = 0
    ) {
        super(message)
        this.name = "ApiError"
    }
}

export const tokenStore = {
    get access(): string | null {
        return safeRead(ACCESS_TOKEN_KEY)
    },
    get refresh(): string | null {
        return safeRead(REFRESH_TOKEN_KEY)
    },
    set(access: string, refresh: string) {
        safeWrite(ACCESS_TOKEN_KEY, access)
        safeWrite(REFRESH_TOKEN_KEY, refresh)
    },
    clear() {
        safeWrite(ACCESS_TOKEN_KEY, null)
        safeWrite(REFRESH_TOKEN_KEY, null)
    },
}

// localStorage wirft im privaten Modus mancher Browser, statt nur leer zu sein.
function safeRead(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeWrite(key: string, value: string | null) {
    try {
        if (value === null) {
            window.localStorage.removeItem(key)
        } else {
            window.localStorage.setItem(key, value)
        }
    } catch {
        // Ohne Speicher bleibt die Anmeldung auf diese Sitzung beschränkt.
    }
}

interface RequestOptions {
    method?: string
    body?: unknown
    authenticated?: boolean
    query?: Record<string, string | number | undefined>
}

/**
 * Läuft das Zugangstoken ab, wird einmal aufgefrischt und der Aufruf wiederholt.
 *
 * Das passiert genau einmal je Aufruf: scheitert auch der zweite Versuch, ist
 * die Sitzung wirklich vorbei, und eine Schleife aus Auffrischen und Scheitern
 * würde nur den Server beschäftigen.
 */
async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await send(path, options)

    if (response.status === 401 && options.authenticated !== false && tokenStore.refresh !== null) {
        const refreshed = await refreshTokens()
        if (refreshed) {
            const retry = await send(path, options)
            return await unwrap<T>(retry)
        }
        tokenStore.clear()
    }

    return await unwrap<T>(response)
}

async function send(path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json"
    }
    const token = tokenStore.access
    if (options.authenticated !== false && token !== null) {
        headers["Authorization"] = `Bearer ${token}`
    }

    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined && value !== "") {
            query.set(key, String(value))
        }
    }
    const suffix = query.toString().length > 0 ? `?${query.toString()}` : ""

    try {
        return await fetch(`${API_BASE}${path}${suffix}`, {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        })
    } catch {
        // Kein Server erreichbar ist kein Fehler des Nutzers - also auch keine
        // Meldung, die nach einem Tippfehler klingt.
        throw new ApiError("INTERNAL", "Der Server ist gerade nicht erreichbar.")
    }
}

async function unwrap<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const problem = await safeJson<ApiErrorResponse>(response)
        throw new ApiError(
            problem?.error ?? "INTERNAL",
            problem?.message ?? "Da ist etwas schiefgegangen.",
            response.status
        )
    }
    if (response.status === 204) {
        return undefined as T
    }
    return (await response.json()) as T
}

async function safeJson<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T
    } catch {
        return null
    }
}

async function refreshTokens(): Promise<boolean> {
    const refresh = tokenStore.refresh
    if (refresh === null) {
        return false
    }
    try {
        const response = await send("/auth/refresh", {
            method: "POST",
            body: {refreshToken: refresh},
            authenticated: false,
        })
        if (!response.ok) {
            return false
        }
        const tokens = (await response.json()) as RefreshTokenResponse
        tokenStore.set(tokens.accessToken, tokens.refreshToken)
        return true
    } catch {
        return false
    }
}

export const api = {
    register(body: RegisterRequest) {
        return call<AuthResponse>("/auth/register", {method: "POST", body, authenticated: false})
    },
    login(body: LoginRequest) {
        return call<AuthResponse>("/auth/login", {method: "POST", body, authenticated: false})
    },
    me() {
        return call<UserResponse>("/me")
    },
    updateProfile(body: UpdateProfileRequest) {
        return call<UserResponse>("/me", {method: "PUT", body})
    },
    sessions(limit = 50) {
        return call<TrainingSessionListResponse>("/sessions", {query: {limit}})
    },
    deleteSession(id: number) {
        return call<{deleted: boolean}>(`/sessions/${id}`, {method: "DELETE"})
    },
    discover() {
        return call<DiscoveryResponse>("/discover")
    },
    myWorkouts() {
        return call<WorkoutListResponse>("/workouts")
    },
    publicWorkouts(query: {query?: string; tag?: string; limit?: number}) {
        return call<WorkoutListResponse>("/workouts/public", {authenticated: false, query})
    },
    workout(id: string) {
        return call<WorkoutDTO>(`/workouts/${id}`)
    },
    saveWorkout(body: SaveWorkoutRequest) {
        return body.id === undefined
            ? call<WorkoutDTO>("/workouts", {method: "POST", body})
            : call<WorkoutDTO>(`/workouts/${body.id}`, {method: "PUT", body})
    },
    createWorkout(body: SaveWorkoutRequest) {
        return call<WorkoutDTO>("/workouts", {method: "POST", body})
    },
    deleteWorkout(id: string) {
        return call<{deleted: boolean}>(`/workouts/${id}`, {method: "DELETE"})
    },
    collections() {
        return call<CollectionListResponse>("/collections")
    },
    saveCollection(body: SaveCollectionRequest) {
        return body.id === undefined
            ? call<CollectionDTO>("/collections", {method: "POST", body})
            : call<CollectionDTO>(`/collections/${body.id}`, {method: "PUT", body})
    },
    deleteCollection(id: string) {
        return call<{deleted: boolean}>(`/collections/${id}`, {method: "DELETE"})
    },
    addToCollection(collectionID: string, workoutID: string) {
        return call<CollectionDTO>(`/collections/${collectionID}/items`, {
            method: "POST",
            body: {workoutID},
        })
    },
    removeFromCollection(collectionID: string, workoutID: string) {
        return call<CollectionDTO>(`/collections/${collectionID}/items/${workoutID}`, {
            method: "DELETE",
        })
    },
}
