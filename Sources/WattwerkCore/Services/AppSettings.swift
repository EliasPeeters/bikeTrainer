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

    public init(
        rider: RiderProfile = .default,
        lastTrainerID: UUID? = nil,
        lastHeartRateID: UUID? = nil,
        simulatorEnabled: Bool = false,
        preventsDisplaySleep: Bool = true,
        startCountdownSeconds: Int = 3
    ) {
        self.rider = rider
        self.lastTrainerID = lastTrainerID
        self.lastHeartRateID = lastHeartRateID
        self.simulatorEnabled = simulatorEnabled
        self.preventsDisplaySleep = preventsDisplaySleep
        self.startCountdownSeconds = startCountdownSeconds
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
        set { settings.rider = newValue }
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        storage.set(data, forKey: Self.key)
    }
}
