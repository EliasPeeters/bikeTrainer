import Foundation
import Observation

/// Wer angemeldet ist - und ob überhaupt jemand.
///
/// Die App funktioniert vollständig ohne Konto. Ein Konto bringt den Abgleich
/// mit dem Server, sonst nichts: keine Funktion ist hinter der Anmeldung
/// versteckt.
@MainActor
@Observable
public final class AccountStore {
    private static let tokenKey = "account.tokens"
    private static let userKey = "account.user"

    public private(set) var user: UserPayload?
    public private(set) var isBusy = false
    public private(set) var lastError: String?

    @ObservationIgnored public let client: APIClient
    @ObservationIgnored private let storage: any KeyValueStorage

    public var isSignedIn: Bool { user != nil }

    public init(storage: any KeyValueStorage, baseURL: URL) {
        self.storage = storage
        client = APIClient(baseURL: baseURL)

        if let data = storage.data(forKey: Self.userKey),
           let decoded = try? JSONDecoder().decode(UserPayload.self, from: data) {
            user = decoded
        }

        let tokens = Self.loadTokens(from: storage)
        Task { [weak self] in
            guard let self else { return }
            await self.client.setTokens(tokens)
            // Frischt der Client die Tokens auf, müssen die neuen auf die
            // Platte - sonst ist die Sitzung nach dem nächsten Start doch vorbei.
            // Der Speicher selbst gehört dem Hauptakteur, also geht der Rückruf
            // dorthin zurück, statt ihn mitzunehmen.
            await self.client.setTokenObserver { [weak self] newTokens in
                Task { @MainActor in
                    self?.persistTokens(newTokens)
                }
            }
        }
    }

    // MARK: Anmeldung

    public func register(email: String, password: String, name: String) async {
        await perform {
            let payload = try await self.client.register(
                email: email,
                password: password,
                name: name.isEmpty ? nil : name
            )
            self.apply(payload)
        }
    }

    public func login(email: String, password: String) async {
        await perform {
            let payload = try await self.client.login(email: email, password: password)
            self.apply(payload)
        }
    }

    public func logout() {
        user = nil
        lastError = nil
        storage.set(nil, forKey: Self.userKey)
        Self.saveTokens(nil, to: storage)
        Task { await client.logout() }
    }

    /// Holt das Profil neu und meldet ab, wenn das gespeicherte Token nicht mehr trägt.
    public func refreshProfile() async {
        guard isSignedIn else { return }
        do {
            let profile = try await client.profile()
            cache(profile)
        } catch APIError.unauthorized {
            logout()
        } catch {
            // Ein Serverausfall ist kein Grund, jemanden abzumelden.
        }
    }

    public func pushProfile(_ rider: RiderProfile) async {
        guard isSignedIn else { return }
        do {
            cache(try await client.updateProfile(rider))
        } catch {
            lastError = (error as? APIError)?.errorDescription
        }
    }

    public func clearError() {
        lastError = nil
    }

    /// Nach einem Wechsel der Serveradresse. Meldet ab, weil Tokens nur für
    /// den Server gelten, der sie ausgestellt hat.
    public func updateBaseURL(_ url: URL) {
        logout()
        Task { [client] in await client.setBaseURL(url) }
    }

    // MARK: Innenleben

    private func perform(_ work: @escaping () async throws -> Void) async {
        isBusy = true
        lastError = nil
        do {
            try await work()
        } catch {
            lastError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isBusy = false
    }

    private func apply(_ payload: AuthPayload) {
        cache(payload.user)
        Self.saveTokens(
            APIClient.Tokens(access: payload.accessToken, refresh: payload.refreshToken),
            to: storage
        )
    }

    private func persistTokens(_ tokens: APIClient.Tokens?) {
        Self.saveTokens(tokens, to: storage)
    }

    private func cache(_ profile: UserPayload) {
        user = profile
        if let data = try? JSONEncoder().encode(profile) {
            storage.set(data, forKey: Self.userKey)
        }
    }

    private struct StoredTokens: Codable {
        var access: String
        var refresh: String
    }

    private static func loadTokens(from storage: any KeyValueStorage) -> APIClient.Tokens? {
        guard let data = storage.data(forKey: tokenKey),
              let stored = try? JSONDecoder().decode(StoredTokens.self, from: data)
        else { return nil }
        return APIClient.Tokens(access: stored.access, refresh: stored.refresh)
    }

    private static func saveTokens(_ tokens: APIClient.Tokens?, to storage: any KeyValueStorage) {
        guard let tokens else {
            storage.set(nil, forKey: tokenKey)
            return
        }
        let stored = StoredTokens(access: tokens.access, refresh: tokens.refresh)
        storage.set(try? JSONEncoder().encode(stored), forKey: tokenKey)
    }
}
