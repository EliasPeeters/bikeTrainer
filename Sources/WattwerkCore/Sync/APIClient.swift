import Foundation

/// Der HTTP-Zugang zur Wattwerk-API.
///
/// Bewusst ohne Zustand über die Tokens hinaus: wer angemeldet ist und was
/// abgeglichen wurde, entscheidet `AccountStore`. Dadurch lässt sich der Client
/// in Tests gegen eine Attrappe tauschen, ohne die Anmeldelogik mitzuschleppen.
public actor APIClient {
    public struct Tokens: Sendable, Equatable {
        public var access: String
        public var refresh: String

        public init(access: String, refresh: String) {
            self.access = access
            self.refresh = refresh
        }
    }

    private var baseURL: URL
    private let session: URLSession
    private var tokens: Tokens?
    /// Wird gerufen, wenn sich die Tokens durch eine Auffrischung geändert haben.
    private var onTokensChanged: (@Sendable (Tokens?) -> Void)?

    /// Die Tokens gehören in den Init, nicht in einen Aufruf danach.
    ///
    /// Ein `await client.setTokens(…)` aus einem unstrukturierten Task läuft
    /// irgendwann - unter Umständen erst, nachdem sich jemand angemeldet hat,
    /// und überschreibt dann dessen frische Tokens mit den alten. Als Argument
    /// stehen sie fest, bevor der Client den ersten Aufruf sehen kann.
    public init(baseURL: URL, tokens: Tokens? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    /// Wechselt den Server zur Laufzeit - in Entwicklungsbauten umstellbar,
    /// ohne die App neu zu starten.
    public func setBaseURL(_ url: URL) {
        baseURL = url
    }

    public func setTokens(_ tokens: Tokens?) {
        self.tokens = tokens
    }

    public func setTokenObserver(_ observer: @escaping @Sendable (Tokens?) -> Void) {
        onTokensChanged = observer
    }

    public var isAuthenticated: Bool { tokens != nil }

    // MARK: Konto

    public func register(email: String, password: String, name: String?) async throws -> AuthPayload {
        struct Body: Encodable {
            let email: String
            let password: String
            let name: String?
        }
        let payload: AuthPayload = try await send(
            "/auth/register",
            method: "POST",
            body: Body(email: email, password: password, name: name),
            authenticated: false
        )
        applyTokens(Tokens(access: payload.accessToken, refresh: payload.refreshToken))
        return payload
    }

    public func login(email: String, password: String) async throws -> AuthPayload {
        struct Body: Encodable {
            let email: String
            let password: String
        }
        let payload: AuthPayload = try await send(
            "/auth/login",
            method: "POST",
            body: Body(email: email, password: password),
            authenticated: false
        )
        applyTokens(Tokens(access: payload.accessToken, refresh: payload.refreshToken))
        return payload
    }

    public func logout() {
        applyTokens(nil)
    }

    public func profile() async throws -> UserPayload {
        try await send("/me", method: "GET", body: Optional<Int>.none)
    }

    public func updateProfile(_ rider: RiderProfile) async throws -> UserPayload {
        struct Body: Encodable {
            let name: String
            let ftp: Int
            let maxHeartRate: Int
            let restingHeartRate: Int
            let weightKg: Double
        }
        return try await send(
            "/me",
            method: "PUT",
            body: Body(
                name: rider.name,
                ftp: rider.ftp,
                maxHeartRate: rider.maxHeartRate,
                restingHeartRate: rider.restingHeartRate,
                weightKg: rider.weightKg
            )
        )
    }

    /// Löscht das Konto endgültig. Das Passwort muss mit - ein abgegriffenes
    /// Zugangstoken soll dafür nicht reichen.
    public func deleteAccount(password: String) async throws {
        struct Body: Encodable {
            let password: String
        }
        struct Ignored: Decodable {}
        let _: Ignored = try await send("/me/delete", method: "POST", body: Body(password: password))
        applyTokens(nil)
    }

    // MARK: Programme

    public func myWorkouts() async throws -> [WorkoutPayload] {
        let list: WorkoutListPayload = try await send("/workouts", method: "GET", body: Optional<Int>.none)
        return list.workouts
    }

    public func syncWorkouts(_ workouts: [WorkoutPayload]) async throws -> [WorkoutPayload] {
        struct Body: Encodable {
            let workouts: [SaveWorkoutBody]
        }
        let list: WorkoutListPayload = try await send(
            "/workouts/sync",
            method: "POST",
            body: Body(workouts: workouts.map(SaveWorkoutBody.init))
        )
        return list.workouts
    }

    public func saveWorkout(_ workout: WorkoutPayload) async throws -> WorkoutPayload {
        try await send("/workouts", method: "POST", body: SaveWorkoutBody(workout))
    }

    public func deleteWorkout(id: String) async throws {
        struct Ignored: Decodable {}
        let _: Ignored = try await send("/workouts/\(id)", method: "DELETE", body: Optional<Int>.none)
    }

    public func discover() async throws -> DiscoveryPayload {
        try await send("/discover", method: "GET", body: Optional<Int>.none)
    }

    public func collections() async throws -> [CollectionPayload] {
        let list: CollectionListPayload = try await send("/collections", method: "GET", body: Optional<Int>.none)
        return list.collections
    }

    // MARK: Einheiten

    public func upload(session record: SessionRecord) async throws {
        struct Ignored: Decodable {}
        let _: Ignored = try await send("/sessions", method: "POST", body: SessionPayload(record))
    }

    // MARK: Innenleben

    private func applyTokens(_ newTokens: Tokens?) {
        tokens = newTokens
        onTokensChanged?(newTokens)
    }

    private func send<Body: Encodable, Result: Decodable>(
        _ path: String,
        method: String,
        body: Body?,
        authenticated: Bool = true,
        allowRefresh: Bool = true
    ) async throws -> Result {
        let (data, response) = try await perform(path, method: method, body: body, authenticated: authenticated)

        // Eine 401 ohne Token heißt: es fehlt die Sitzung, nicht etwas an der
        // Anfrage. Vorher fiel dieser Fall bis zur allgemeinen
        // Fehlerbehandlung durch und kam als `.server("Anmeldung
        // erforderlich.")` heraus - ein Text, den `refreshProfile` und
        // `syncAll` nicht als „abgemeldet“ erkennen. Sie zeigten ihn an und
        // ließen den Zustand, wie er war.
        if response.statusCode == 401, authenticated, tokens == nil {
            throw APIError.unauthorized
        }

        // Abgelaufenes Zugangstoken: einmal auffrischen, dann denselben Aufruf
        // wiederholen. Genau einmal - scheitert auch der zweite Versuch, ist die
        // Sitzung wirklich vorbei, und eine Schleife hilft niemandem.
        //
        // Kommt die 401 auch nach dem Auffrischen zurück (`allowRefresh` ist
        // dann falsch), liegt es nicht an der Sitzung, sondern an dieser einen
        // Anfrage - etwa einem falschen Passwort beim Löschen des Kontos. Die
        // fällt unten als Serverfehler durch, und die Anmeldung bleibt stehen.
        if response.statusCode == 401, authenticated, allowRefresh, tokens != nil {
            if try await refreshTokens() {
                return try await send(
                    path,
                    method: method,
                    body: body,
                    authenticated: authenticated,
                    allowRefresh: false
                )
            }
            applyTokens(nil)
            throw APIError.unauthorized
        }

        guard (200..<300).contains(response.statusCode) else {
            if let problem = try? JSONDecoder().decode(APIErrorPayload.self, from: data) {
                throw APIError.server(code: problem.error, message: problem.message)
            }
            throw APIError.server(code: "HTTP_\(response.statusCode)", message: "Der Server meldet Fehler \(response.statusCode).")
        }

        if data.isEmpty, let empty = EmptyResult() as? Result {
            return empty
        }
        do {
            return try JSONDecoder().decode(Result.self, from: data)
        } catch {
            // Routen ohne Antwortkörper (DELETE) liefern JSON, das nicht zum
            // erwarteten Typ passt - solange der Status stimmt, ist das kein Fehler.
            if let empty = EmptyResult() as? Result {
                return empty
            }
            throw APIError.decoding
        }
    }

    private func perform<Body: Encodable>(
        _ path: String,
        method: String,
        body: Body?,
        authenticated: Bool
    ) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 20

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        if authenticated, let token = tokens?.access {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.decoding
            }
            return (data, http)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.offline(
                url: baseURL.absoluteString,
                reason: (error as NSError).localizedDescription
            )
        }
    }

    private func refreshTokens() async throws -> Bool {
        guard let refresh = tokens?.refresh else { return false }
        struct Body: Encodable {
            let refreshToken: String
        }
        do {
            let payload: TokenPayload = try await send(
                "/auth/refresh",
                method: "POST",
                body: Body(refreshToken: refresh),
                authenticated: false,
                allowRefresh: false
            )
            applyTokens(Tokens(access: payload.accessToken, refresh: payload.refreshToken))
            return true
        } catch {
            return false
        }
    }
}

/// Platzhalter für Antworten ohne auswertbaren Körper.
struct EmptyResult: Decodable {}

/// Der Körper, den die Speicherrouten erwarten - ohne die abgeleiteten Felder,
/// die der Server selbst berechnet.
struct SaveWorkoutBody: Encodable {
    let id: String
    let name: String
    let summary: String
    let tags: [String]
    let visibility: String
    let segments: [WorkoutSegmentPayload]

    init(_ payload: WorkoutPayload) {
        id = payload.id
        name = payload.name
        summary = payload.summary
        tags = payload.tags
        visibility = payload.visibility
        segments = payload.segments
    }
}
