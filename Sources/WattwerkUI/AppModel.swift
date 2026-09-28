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
        case plan
        case devices
        case history
        case profile
        case account

        public var id: String { rawValue }

        public var title: String {
            switch self {
            case .training: return "Training"
            case .plan: return "Wochenplan"
            case .devices: return "Geräte"
            case .history: return "Verlauf"
            case .profile: return "Profil"
            case .account: return "Konto"
            }
        }

        public var systemImage: String {
            switch self {
            case .training: return "figure.outdoor.cycle"
            case .plan: return "calendar.day.timeline.left"
            case .devices: return "antenna.radiowaves.left.and.right"
            case .history: return "calendar"
            case .profile: return "person.crop.circle"
            case .account: return "icloud"
            }
        }
    }

    public let settings: SettingsStore
    public let library: WorkoutLibrary
    public let sessions: SessionStore
    public let plan: TrainingPlanStore
    public let bluetooth: BluetoothManager
    public let simulator = SimulatedTrainer()
    public let engine: WorkoutEngine
    public let account: AccountStore
    public let sync: SyncService

    public var section: Section = .training
    /// Einheiten anderer Geräte je Woche (Schlüssel: Montag 0 Uhr), wie der
    /// Server sie geliefert hat. Nur für den Wochenplan.
    public private(set) var remoteRides: [Date: [TrainingWeek.Ride]] = [:]
    /// Set while the ride screen is up (full screen on both platforms).
    public var isRiding = false
    /// Counts down before the first interval so you can clip in.
    public var countdown: Int = 0

    @ObservationIgnored private var countdownTask: Task<Void, Never>?
    @ObservationIgnored private var pendingWorkout: Workout?
    @ObservationIgnored private let displayBlocker = DisplaySleepBlocker()

    /// Die eine Instanz der App.
    ///
    /// `@State private var model = AppModel()` sieht richtig aus, wertet den
    /// Ausdruck aber bei *jedem* Aufbau der View-Struktur aus - SwiftUI
    /// verwirft das Ergebnis dann zwar, aber erzeugt wurde es trotzdem: samt
    /// CBCentralManager und einem Abgleich-Task. Im Log des Servers sah man das
    /// als drei Anmeldungen hintereinander. Ein `static let` wird genau einmal
    /// ausgewertet.
    @MainActor public static let shared = AppModel()

    public init(storage: (any KeyValueStorage)? = nil) {
        let storage = storage ?? StorageFactory.makeDefault()
        let settings = SettingsStore(storage: storage)
        self.settings = settings
        bluetooth = BluetoothManager()
        engine = WorkoutEngine(ftp: settings.rider.ftp)
        let library = WorkoutLibrary(storage: storage)
        let sessions = SessionStore(storage: storage)
        let plan = TrainingPlanStore(storage: storage)
        account = AccountStore(
            storage: storage,
            baseURL: APIEnvironment.url(from: settings.settings.apiBaseURL)
        )
        sync = SyncService(account: account, library: library, sessions: sessions, settings: settings, plan: plan)
        self.library = library
        self.sessions = sessions
        self.plan = plan
        wire()
        // Beim Start einmal abgleichen, wenn ein Konto hinterlegt ist. Schlägt
        // es fehl, bleibt die App vollständig benutzbar - nur eben lokal.
        Task { [weak self] in
            await self?.account.refreshProfile()
            await self?.sync.syncAll()
        }
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
            // Hochladen, sobald es geht. Klappt es nicht, bleibt die Einheit
            // als ausstehend liegen und geht beim nächsten Abgleich mit.
            Task { [weak self] in
                await self?.sync.uploadPendingSessions()
                await self?.sync.refreshDiscovery()
            }
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
        var copy = workout
        copy.updatedAt = Date()
        library.save(copy)
        scheduleSync()
    }

    public func delete(_ workout: Workout) {
        library.delete(id: workout.id)
        if plan.entries.contains(where: { $0.workoutID == workout.id }) {
            plan.removeEntries(forWorkout: workout.id)
            schedulePlanSync()
        }
        if account.isSignedIn, workout.ownerUserID != nil {
            Task { [weak self] in
                try? await self?.account.client.deleteWorkout(id: workout.id.uuidString.lowercased())
                await self?.sync.refreshDiscovery()
            }
        }
    }

    private func scheduleSync() {
        guard account.isSignedIn else { return }
        Task { [weak self] in await self?.sync.syncAll() }
    }

    // MARK: Wochenplan

    /// Die Woche um `date`, Montag bis Sonntag, mit dem, was gefahren wurde.
    ///
    /// Gefahren heißt: auf diesem Gerät, und - sobald `refreshRides` sie
    /// geholt hat - auch auf allen anderen. Sonst bliebe auf dem Apple TV ein
    /// Dienstag offen, den man am Mac gefahren hat.
    public func planWeek(containing date: Date = Date(), now: Date = Date()) -> [PlanDay] {
        TrainingWeek.days(around: date, today: now, entries: plan.entries, rides: rides(inWeekOf: date))
    }

    public func planWeek(now: Date) -> [PlanDay] {
        planWeek(containing: now, now: now)
    }

    /// Die Einheiten der Woche um `date`, von diesem Gerät und vom Server.
    public func rides(inWeekOf date: Date) -> [TrainingWeek.Ride] {
        let remote = remoteRides[TrainingWeek.start(of: date)] ?? []
        return TrainingWeek.rides(TrainingWeek.merge(local: sessions.sessions, remote: remote), inWeekOf: date)
    }

    /// Holt die gefahrenen Einheiten einer Woche vom Server. Ohne Konto oder
    /// ohne Netz bleibt es bei denen dieses Geräts.
    public func refreshRides(forWeekOf date: Date) async {
        let start = TrainingWeek.start(of: date)
        guard start <= Date(), let end = Calendar.current.date(byAdding: .day, value: 7, to: start),
              let rides = await sync.rides(from: start, to: end)
        else { return }
        remoteRides[start] = rides
    }

    public func planToday(now: Date = Date()) -> PlanDay? {
        planWeek(now: now).first(where: \.isToday)
    }

    /// Das Programm hinter einem Eintrag, in seiner aktuellen Fassung.
    ///
    /// Zuerst die eigene Bibliothek (samt Katalog), dann was der Server gerade
    /// in den Reihen zeigt, zuletzt die Kopie im Eintrag. `nil` heißt: das
    /// Programm ist gelöscht und nirgends mehr zu finden.
    public func workout(for entry: PlanEntry) -> Workout? {
        if let workout = library.workout(id: entry.workoutID) { return workout }
        if let workout = discoveredWorkouts.first(where: { $0.id == entry.workoutID }) { return workout }
        return entry.workout
    }

    public func planWorkout(_ workout: Workout, on weekday: Weekday) {
        // Eine Kopie nur für Programme, die nicht in der eigenen Bibliothek
        // liegen - die übrigen findet der Plan über ihre Kennung.
        plan.add(workout, on: weekday, keepsCopy: library.workout(id: workout.id) == nil)
        schedulePlanSync()
    }

    public func removePlanEntry(_ entry: PlanEntry) {
        plan.remove(id: entry.id)
        schedulePlanSync()
    }

    public func movePlanEntry(_ entry: PlanEntry, to weekday: Weekday) {
        plan.move(id: entry.id, to: weekday)
        schedulePlanSync()
    }

    /// Wie oft `workout` im Plan steht - für den Knopf „Einplanen“.
    public func planWeekdays(for workout: Workout) -> [Weekday] {
        plan.entries.filter { $0.workoutID == workout.id }.map(\.weekday).sorted()
    }

    /// Was sich einplanen lässt: eigene Programme, der Katalog und, was der
    /// Server in den Reihen zeigt und noch nicht in der Bibliothek liegt.
    public var plannableRows: [LibraryRow] {
        var rows: [LibraryRow] = []
        let own = library.userWorkouts.sorted { $0.updatedAt > $1.updatedAt }
        if !own.isEmpty {
            rows.append(LibraryRow(id: "own", title: "Deine Programme", subtitle: nil, workouts: own))
        }
        rows.append(LibraryRow(id: "catalog", title: "Aus dem Katalog", subtitle: nil, workouts: library.builtInWorkouts))
        let known = Set(library.allWorkouts.map(\.id))
        let discovered = discoveredWorkouts.filter { !known.contains($0.id) }
        if !discovered.isEmpty {
            rows.append(LibraryRow(id: "discovered", title: "Entdeckt", subtitle: "Öffentliche Programme", workouts: discovered))
        }
        return rows
    }

    /// Alle Programme aus den Reihen und Ordnern des Servers, jedes einmal.
    private var discoveredWorkouts: [Workout] {
        guard let discovery = sync.discovery else { return [] }
        var seen = Set<String>()
        let payloads = discovery.rows.flatMap(\.workouts) + discovery.collections.flatMap(\.workouts)
        return payloads.filter { seen.insert($0.id).inserted }.map { $0.makeWorkout() }
    }

    private func schedulePlanSync() {
        guard account.isSignedIn else { return }
        Task { [weak self] in await self?.sync.pushPlan() }
    }

    // MARK: Bibliothek

    /// Die Reihen der Bibliothek.
    ///
    /// Angemeldet und online stellt der Server sie zusammen - dann sehen App und
    /// Web-Portal dasselbe. Ohne Konto oder ohne Netz werden sie lokal gebaut,
    /// damit die Bibliothek nie leer dasteht.
    public var libraryRows: [LibraryRow] {
        if let discovery = sync.discovery, !discovery.rows.isEmpty {
            return discovery.rows.map { row in
                LibraryRow(
                    id: row.key,
                    title: row.title,
                    subtitle: row.subtitle,
                    workouts: row.workouts.map { $0.makeWorkout() }
                )
            }
        }
        return localLibraryRows
    }

    public var localLibraryRows: [LibraryRow] {
        var rows: [LibraryRow] = []
        let own = library.userWorkouts.sorted { $0.updatedAt > $1.updatedAt }
        if !own.isEmpty {
            rows.append(LibraryRow(id: "own", title: "Deine Programme", subtitle: nil, workouts: own))
        }
        rows.append(
            LibraryRow(
                id: "catalog",
                title: "Aus dem Katalog",
                subtitle: "Die mitgelieferten Programme",
                workouts: library.builtInWorkouts
            )
        )
        let all = library.allWorkouts
        let short = all.filter { $0.duration <= 45 * 60 }
        if !short.isEmpty {
            rows.append(
                LibraryRow(id: "short", title: "Kurz und knackig", subtitle: "Unter 45 Minuten", workouts: short)
            )
        }
        let long = all.filter { $0.duration >= 60 * 60 }
        if !long.isEmpty {
            rows.append(
                LibraryRow(id: "long", title: "Lange Einheiten", subtitle: "Ab einer Stunde", workouts: long)
            )
        }
        return rows
    }

    public var collections: [CollectionPayload] {
        sync.discovery?.collections ?? []
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

/// Eine Reihe in der Bibliothek - ob vom Server oder lokal gebaut.
public struct LibraryRow: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String?
    public let workouts: [Workout]
}
