import Foundation
import Observation
#if os(iOS) || os(tvOS)
import UIKit
#endif
import SwiftUI
import WattwerkBluetooth
import WattwerkCore

/// The object every screen hangs off: stores, Bluetooth, the ride engine and
/// the little bit of navigation state that the Mac and the TV share.
@MainActor
@Observable
public final class AppModel {
    public enum Section: String, CaseIterable, Identifiable, Hashable {
        case training
        case devices
        case history
        case profile

        public var id: String { rawValue }

        public var title: String {
            switch self {
            case .training: return "Training"
            case .devices: return "Geräte"
            case .history: return "Verlauf"
            case .profile: return "Profil"
            }
        }

        public var systemImage: String {
            switch self {
            case .training: return "figure.outdoor.cycle"
            case .devices: return "antenna.radiowaves.left.and.right"
            case .history: return "calendar"
            case .profile: return "person.crop.circle"
            }
        }
    }

    public let settings: SettingsStore
    public let library: WorkoutLibrary
    public let sessions: SessionStore
    public let bluetooth: BluetoothManager
    public let simulator = SimulatedTrainer()
    public let engine: WorkoutEngine

    public var section: Section = .training
    /// Set while the ride screen is up (full screen on both platforms).
    public var isRiding = false
    /// Counts down before the first interval so you can clip in.
    public var countdown: Int = 0

    @ObservationIgnored private var countdownTask: Task<Void, Never>?
    @ObservationIgnored private var pendingWorkout: Workout?
    @ObservationIgnored private let displayBlocker = DisplaySleepBlocker()

    public init(storage: (any KeyValueStorage)? = nil) {
        let storage = storage ?? StorageFactory.makeDefault()
        let settings = SettingsStore(storage: storage)
        self.settings = settings
        library = WorkoutLibrary(storage: storage)
        sessions = SessionStore(storage: storage)
        bluetooth = BluetoothManager()
        engine = WorkoutEngine(ftp: settings.rider.ftp)
        wire()
    }

    private func wire() {
        bluetooth.autoConnectTrainerID = settings.settings.lastTrainerID
        bluetooth.autoConnectHeartRateID = settings.settings.lastHeartRateID

        bluetooth.onTrainerReading = { [weak self] reading in
            guard let self else { return }
            var reading = reading
            // A dedicated strap always wins over the trainer's relayed value.
            if bluetooth.heartRateMonitor != nil { reading.heartRate = nil }
            engine.ingest(reading)
        }
        bluetooth.onHeartRate = { [weak self] bpm in
            self?.engine.ingest(heartRate: bpm)
        }
        bluetooth.onTrainerChanged = { [weak self] session in
            guard let self else { return }
            settings.settings.lastTrainerID = session?.peripheral.identifier ?? settings.settings.lastTrainerID
            if session == nil { engine.clearTrainerReadings() }
            bindTrainerControl()
        }
        simulator.onReading = { [weak self] reading in
            guard let self, settings.settings.simulatorEnabled else { return }
            var reading = reading
            if bluetooth.heartRateMonitor != nil { reading.heartRate = nil }
            engine.ingest(reading)
        }

        if settings.settings.simulatorEnabled { simulator.start() }
        bindTrainerControl()
    }

    /// Decides who the engine talks to: the simulator wins when demo mode is on.
    public func bindTrainerControl() {
        if settings.settings.simulatorEnabled {
            engine.trainerControl = simulator
        } else {
            engine.trainerControl = bluetooth.trainer
        }
        engine.setFTP(settings.rider.ftp)
    }

    public func setSimulatorEnabled(_ enabled: Bool) {
        settings.settings.simulatorEnabled = enabled
        if enabled {
            simulator.reset()
            simulator.start()
        } else {
            simulator.stop()
            engine.clearTrainerReadings()
        }
        bindTrainerControl()
    }

    // MARK: Sensor status for the header

    public var hasPowerSource: Bool {
        settings.settings.simulatorEnabled || bluetooth.trainer != nil
    }

    public var trainerName: String? {
        if settings.settings.simulatorEnabled { return "Simulator" }
        return bluetooth.trainer?.displayName
    }

    public var canControlTrainer: Bool {
        engine.trainerControl?.supportsTargetPower ?? false
    }

    public var heartRateName: String? {
        bluetooth.heartRateMonitor?.displayName
    }

    // MARK: Ride lifecycle

    public func startRide(_ workout: Workout) {
        pendingWorkout = workout
        engine.setFTP(settings.rider.ftp)
        bindTrainerControl()
        isRiding = true
        displayBlocker.begin(enabled: settings.settings.preventsDisplaySleep)

        let seconds = max(0, settings.settings.startCountdownSeconds)
        guard seconds > 0 else {
            beginPendingWorkout()
            return
        }
        countdown = seconds
        countdownTask?.cancel()
        countdownTask = Task { [weak self] in
            while let self, self.countdown > 0, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                self.countdown -= 1
            }
            guard let self, !Task.isCancelled else { return }
            self.beginPendingWorkout()
        }
    }

    private func beginPendingWorkout() {
        guard let workout = pendingWorkout else { return }
        pendingWorkout = nil
        countdown = 0
        engine.start(workout)
    }

    /// Called from the summary screen. `save: false` throws the ride away.
    public func finishRide(save: Bool) {
        if save, let record = engine.lastRecord {
            sessions.add(record)
        }
        engine.reset()
        countdownTask?.cancel()
        countdownTask = nil
        countdown = 0
        pendingWorkout = nil
        isRiding = false
        displayBlocker.end()
    }

    /// Leaving the ride screen while still riding just hides it - the engine keeps running.
    public func closeRideScreen() {
        isRiding = false
    }

    // MARK: Workouts

    public func save(_ workout: Workout) {
        library.save(workout)
    }

    public func delete(_ workout: Workout) {
        library.delete(id: workout.id)
    }

    /// Ramp test helper: turn the best minute of the last ride into a new FTP.
    public func applyFTPFromLastRamp() -> Int? {
        guard let record = sessions.sessions.first, !record.samples.isEmpty else { return nil }
        let watts = record.samples.map(\.power)
        guard watts.count >= 60 else { return nil }
        var best = 0
        var rolling = 0
        for (index, value) in watts.enumerated() {
            rolling += value
            if index >= 60 { rolling -= watts[index - 60] }
            if index >= 59 { best = max(best, rolling / 60) }
        }
        let ftp = PowerMath.estimatedFTP(fromRampBestMinute: best)
        settings.rider.ftp = ftp
        settings.rider.ftpUpdatedAt = Date()
        engine.setFTP(ftp)
        return ftp
    }
}

/// Keeps the screen on while riding. Nobody wants the display to sleep during
/// a five minute interval.
@MainActor
final class DisplaySleepBlocker {
    #if os(macOS)
    private var activity: NSObjectProtocol?
    #endif

    func begin(enabled: Bool) {
        guard enabled else { return }
        #if os(macOS)
        activity = ProcessInfo.processInfo.beginActivity(
            options: [.idleDisplaySleepDisabled, .idleSystemSleepDisabled],
            reason: "Wattwerk Trainingseinheit"
        )
        #elseif os(iOS) || os(tvOS)
        UIApplication.shared.isIdleTimerDisabled = true
        #endif
    }

    func end() {
        #if os(macOS)
        if let activity {
            ProcessInfo.processInfo.endActivity(activity)
            self.activity = nil
        }
        #elseif os(iOS) || os(tvOS)
        UIApplication.shared.isIdleTimerDisabled = false
        #endif
    }
}
