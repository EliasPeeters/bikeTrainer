import Foundation
import Observation

/// Everything the user can change that is not a workout.
public struct AppSettings: Hashable, Sendable, Codable {
    public var rider: RiderProfile
    /// Peripheral identifiers we reconnect to automatically on launch.
    public var lastTrainerID: UUID?
    public var lastHeartRateID: UUID?
    /// Runs the ride against a built-in fake trainer - lets the whole app be
    /// exercised without hardware, which is how the tvOS target gets developed.
    public var simulatorEnabled: Bool
    /// Keep the display awake during a ride (macOS/iOS).
    public var preventsDisplaySleep: Bool
    /// Countdown before the first interval starts.
    public var startCountdownSeconds: Int
    /// Wohin die App synchronisiert. Siehe `APIEnvironment`.
    public var apiBaseURL: String
    /// Wann das Fahrerprofil zuletzt auf diesem Gerät geändert wurde.
    ///
    /// Optional, damit Einstellungen aus einer früheren Fassung sich weiter
    /// lesen lassen. `nil` gilt als "geändert": lieber einmal zu viel
    /// hochschieben als eine FTP verlieren, die jemand nach einem Test
    /// eingetragen hat.
    public var riderUpdatedAt: Date?
    /// Wann das Profil zuletzt abgeglichen wurde.
    public var profileSyncedAt: Date?

    public init(
        rider: RiderProfile = .default,
        lastTrainerID: UUID? = nil,
        lastHeartRateID: UUID? = nil,
        simulatorEnabled: Bool = false,
        preventsDisplaySleep: Bool = true,
        startCountdownSeconds: Int = 3,
        apiBaseURL: String = APIEnvironment.defaultBaseURL,
        riderUpdatedAt: Date? = nil,
        profileSyncedAt: Date? = nil
    ) {
        self.rider = rider
        self.lastTrainerID = lastTrainerID
        self.lastHeartRateID = lastHeartRateID
        self.simulatorEnabled = simulatorEnabled
        self.preventsDisplaySleep = preventsDisplaySleep
        self.startCountdownSeconds = startCountdownSeconds
        self.apiBaseURL = apiBaseURL
        self.riderUpdatedAt = riderUpdatedAt
        self.profileSyncedAt = profileSyncedAt
    }
}

@MainActor
@Observable
public final class SettingsStore {
    private static let key = "settings"

    public var settings: AppSettings {
        didSet { persist() }
    }

    @ObservationIgnored private let storage: any KeyValueStorage

    public init(storage: any KeyValueStorage) {
        self.storage = storage
        if let data = storage.data(forKey: Self.key),
           let decoded = try? JSONDecoder().decode(AppSettings.self, from: data) {
            settings = decoded
        } else {
            settings = AppSettings()
        }
    }

    public var rider: RiderProfile {
        get { settings.rider }
        set {
            settings.rider = newValue
            // Jede Änderung über diesen Weg kommt vom Gerät und gewinnt damit
            // beim nächsten Abgleich.
            settings.riderUpdatedAt = Date()
        }
    }

    /// Übernimmt das Profil vom Server, ohne es als lokal geändert zu markieren.
    ///
    /// Ohne diesen getrennten Weg würde jedes Herunterladen das Profil sofort
    /// wieder als "auf dem Gerät geändert" führen, und der Server käme nie zum Zug.
    public func applyRemoteRider(_ rider: RiderProfile) {
        settings.rider = rider
    }

    /// `true`, wenn das Profil seit dem letzten Abgleich auf diesem Gerät
    /// geändert wurde.
    public var riderNeedsUpload: Bool {
        // Noch nie abgeglichen: hochschieben. Das lokale Profil ist dann das
        // einzige, das es gibt, und der Server hat nur seine Standardwerte.
        guard let synced = settings.profileSyncedAt else { return true }
        // Abgeglichen und seither nichts auf dem Gerät geändert: der Server
        // gewinnt - sonst käme eine Korrektur im Web-Portal nie hier an.
        guard let changed = settings.riderUpdatedAt else { return false }
        return changed > synced
    }

    public func markProfileSynced(at date: Date = Date()) {
        settings.profileSyncedAt = date
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        storage.set(data, forKey: Self.key)
    }
}
