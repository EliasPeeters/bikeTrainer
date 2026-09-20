import Foundation
import Observation

/// Drives a ride: keeps the clock, resolves the current target, commands the
/// trainer and records what actually happened.
///
/// Everything is `@MainActor` - this object is read directly by SwiftUI views
/// several times per second, and the amount of work per tick is tiny.
@MainActor
@Observable
public final class WorkoutEngine {
    public enum State: Hashable, Sendable {
        case idle
        case running
        case paused
        case finished
    }

    /// How often the engine re-evaluates the timeline. Fast enough for a smooth
    /// countdown, slow enough to stay invisible in Activity Monitor.
    public static let tickInterval: TimeInterval = 0.25
    /// Guard against wall-clock jumps (laptop lid closed mid-interval).
    private static let maxTickDelta: TimeInterval = 2.0
    /// Re-send the target even when unchanged, so a trainer that dropped a packet recovers.
    private static let targetKeepAlive: TimeInterval = 5.0
    /// Ramps change the target on every tick; writing that often would flood the
    /// control point, so commands are rate limited to roughly one per second.
    private static let minimumTargetInterval: TimeInterval = 1.0

    // MARK: Observable state

    public private(set) var state: State = .idle
    public private(set) var workout: Workout?
    public private(set) var elapsed: TimeInterval = 0
    public private(set) var position: WorkoutTimeline.Position?
    /// The target after the intensity bias has been applied - what the trainer is told.
    public private(set) var commandedWatts: Int?
    /// The target as written in the workout, before bias.
    public private(set) var plannedWatts: Int?
    public private(set) var live = LiveReadings()
    public private(set) var stats = LiveStats()
    public private(set) var lastRecord: SessionRecord?
    public private(set) var lastControlError: String?

    /// Rider-facing intensity trim, like the +/- buttons on a head unit. 0.5 ... 1.5
    ///
    /// Clamped through a setter method rather than a `didSet`: under `@Observable`
    /// the stored property becomes a computed one, so assigning to it from its own
    /// `didSet` recurses until the stack runs out.
    public private(set) var intensityBias: Double = 1.0
    public private(set) var ftp: Int

    /// The connected trainer, if any. Weak: the Bluetooth layer owns it.
    public weak var trainerControl: (any TrainerControl)?

    // MARK: Internals

    @ObservationIgnored private var timeline: WorkoutTimeline?
    @ObservationIgnored private let recorder = SessionRecorder()
    @ObservationIgnored private var lastTick: Date?
    @ObservationIgnored private var lastRecordedSecond: Int = -1
    @ObservationIgnored private var lastSentWatts: Int?
    @ObservationIgnored private var lastSentAt: Date?
    @ObservationIgnored private var ticker: Task<Void, Never>?
    /// Tests drive `tick(at:)` themselves instead of waiting for real time.
    @ObservationIgnored private let usesRealClock: Bool

    public init(ftp: Int = 200, usesRealClock: Bool = true) {
        self.ftp = max(50, ftp)
        self.usesRealClock = usesRealClock
    }

    deinit {
        ticker?.cancel()
    }

    // MARK: Derived values for the UI

    public var totalDuration: TimeInterval { timeline?.duration ?? 0 }

    public var remaining: TimeInterval { max(0, totalDuration - elapsed) }

    public var progress: Double {
        guard totalDuration > 0 else { return 0 }
        return min(max(elapsed / totalDuration, 0), 1)
    }

    public var nextSegment: WorkoutSegment? {
        guard let timeline, let position else { return nil }
        return timeline.segment(after: position.segmentIndex)
    }

    public var currentZone: PowerZone? {
        guard let watts = commandedWatts else { return nil }
        return PowerZone(watts: watts, ftp: ftp)
    }

    /// How far the rider is off target right now, as a fraction (`0.1` = 10 % too high).
    public var targetDeviation: Double? {
        guard let target = commandedWatts, target > 0, let actual = live.power else { return nil }
        return (Double(actual) - Double(target)) / Double(target)
    }

    public var isActive: Bool { state == .running || state == .paused }

    // MARK: Ride control

    public func start(_ workout: Workout, at date: Date = Date()) {
        self.workout = workout
        timeline = WorkoutTimeline(workout: workout, ftp: ftp)
        elapsed = 0
        lastTick = date
        lastRecordedSecond = -1
        lastSentWatts = nil
        lastSentAt = nil
        lastRecord = nil
        lastControlError = nil
        stats = LiveStats()
        recorder.begin(workout: workout, ftp: ftp, at: date)
        state = .running
        refreshPosition()
        Task { [weak self] in await self?.acquireControl() }
        pushTarget(force: true, now: date)
        startTicking()
    }

    /// Ride without a plan: the trainer stays in its own resistance mode and we
    /// just record. Handy for a warm-up before picking a workout.
    public func startFreeRide(at date: Date = Date()) {
        let workout = Workout(
            name: "Freie Fahrt",
            summary: "Offene Einheit ohne Vorgabe",
            segments: [.free(3 * 3600, title: "Freie Fahrt")]
        )
        start(workout, at: date)
    }

    public func pause() {
        guard state == .running else { return }
        state = .paused
        ticker?.cancel()
        ticker = nil
        Task { [weak self] in await self?.releaseControl() }
    }

    public func resume(at date: Date = Date()) {
        guard state == .paused else { return }
        state = .running
        lastTick = date
        Task { [weak self] in await self?.acquireControl() }
        pushTarget(force: true, now: date)
        startTicking()
    }

    public func stop() {
        guard isActive else { return }
        finish(completed: false)
    }

    /// Jump to the start of the next segment.
    public func skipForward() {
        guard let timeline, let position else { return }
        let nextStart = timeline.startTime(ofSegment: position.segmentIndex + 1)
        seek(to: nextStart)
    }

    /// Restart the current segment, or jump to the previous one if we just started this one.
    public func skipBackward() {
        guard let timeline, let position else { return }
        if position.segmentElapsed < 3, position.segmentIndex > 0 {
            seek(to: timeline.startTime(ofSegment: position.segmentIndex - 1))
        } else {
            seek(to: position.segmentStart)
        }
    }

    public func seek(to newElapsed: TimeInterval) {
        guard isActive, let timeline else { return }
        elapsed = min(max(0, newElapsed), timeline.duration)
        refreshPosition()
        if position == nil {
            finish(completed: true)
        } else {
            pushTarget(force: true, now: lastTick ?? Date())
        }
    }

    public func setIntensityBias(_ value: Double) {
        intensityBias = min(max(value, 0.5), 1.5)
        if state == .running { pushTarget(force: true, now: lastTick ?? Date()) }
    }

    public func nudgeBias(by delta: Double) {
        setIntensityBias(intensityBias + delta)
    }

    public func setFTP(_ value: Int) {
        ftp = max(50, value)
        if let workout { timeline = WorkoutTimeline(workout: workout, ftp: ftp) }
        refreshPosition()
    }

    // MARK: Sensor input

    public func ingest(_ reading: TrainerReading) {
        if let power = reading.power {
            live.power = power
            live.powerUpdatedAt = reading.timestamp
        }
        if let cadence = reading.cadence { live.cadence = cadence }
        if let speed = reading.speed { live.speed = speed }
        if let distance = reading.distance { live.distance = distance }
        if let heartRate = reading.heartRate {
            live.heartRate = heartRate
            live.heartRateUpdatedAt = reading.timestamp
        }
    }

    public func ingest(heartRate: Int, at date: Date = Date()) {
        live.heartRate = heartRate
        live.heartRateUpdatedAt = date
    }

    /// Called when the trainer disconnects, so the screen stops showing a stale number.
    public func clearTrainerReadings() {
        live.power = nil
        live.cadence = nil
        live.speed = nil
        live.powerUpdatedAt = nil
    }

    // MARK: The tick

    public func tick(at date: Date) {
        guard state == .running else { return }
        let previous = lastTick ?? date
        let delta = min(max(0, date.timeIntervalSince(previous)), Self.maxTickDelta)
        lastTick = date
        elapsed += delta

        // Pedalling stopped? Show a real zero instead of the last number seen.
        if live.isStale(now: date) {
            live.power = live.power == nil ? nil : 0
            live.cadence = live.cadence == nil ? nil : 0
        }

        refreshPosition()
        guard position != nil else {
            finish(completed: true)
            return
        }
        pushTarget(force: false, now: date)
        recordIfNeeded()
    }

    private func startTicking() {
        guard usesRealClock else { return }
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(WorkoutEngine.tickInterval))
                guard let self, !Task.isCancelled else { return }
                self.tick(at: Date())
            }
        }
    }

    private func refreshPosition() {
        guard let timeline else {
            position = nil
            return
        }
        position = timeline.position(at: elapsed)
        if let position {
            plannedWatts = position.target.resolvedWatts(ftp: ftp)
        } else {
            plannedWatts = nil
        }
    }

    private func recordIfNeeded() {
        let second = Int(elapsed)
        guard second > lastRecordedSecond else { return }
        lastRecordedSecond = second
        recorder.append(
            RideSample(
                elapsed: TimeInterval(second),
                power: live.power ?? 0,
                targetPower: commandedWatts,
                cadence: live.cadence,
                heartRate: live.heartRate,
                speed: live.speed
            )
        )
        stats = recorder.liveStats()
    }

    /// `now` always comes from the engine's own clock, never `Date()` at the call
    /// site - otherwise a synthetic clock and the wall clock get mixed up and the
    /// rate limiting below stops sending altogether.
    private func pushTarget(force: Bool, now: Date) {
        guard let planned = plannedWatts else {
            // Free-ride block: hand the trainer back to the rider.
            if commandedWatts != nil {
                commandedWatts = nil
                lastSentWatts = nil
                Task { [weak self] in await self?.releaseControl() }
            }
            return
        }

        let biased = clampToTrainerRange(Int((Double(planned) * intensityBias).rounded()))
        commandedWatts = biased

        let sinceLastSend = lastSentAt.map { now.timeIntervalSince($0) } ?? .infinity
        let changed = lastSentWatts != biased && sinceLastSend >= Self.minimumTargetInterval
        let stale = sinceLastSend >= Self.targetKeepAlive
        guard force || changed || stale else { return }

        lastSentWatts = biased
        lastSentAt = now
        guard let trainerControl, trainerControl.supportsTargetPower else { return }
        Task { [weak self] in
            do {
                try await trainerControl.setTargetPower(biased)
                self?.lastControlError = nil
            } catch {
                self?.lastControlError = error.localizedDescription
            }
        }
    }

    private func clampToTrainerRange(_ watts: Int) -> Int {
        guard let range = trainerControl?.supportedPowerRange else { return max(0, watts) }
        return min(max(watts, range.lowerBound), range.upperBound)
    }

    private func acquireControl() async {
        guard let trainerControl, trainerControl.supportsTargetPower else { return }
        do {
            try await trainerControl.requestControl()
            lastControlError = nil
        } catch {
            lastControlError = error.localizedDescription
        }
    }

    private func releaseControl() async {
        guard let trainerControl, trainerControl.supportsTargetPower else { return }
        try? await trainerControl.releaseControl()
    }

    private func finish(completed: Bool) {
        ticker?.cancel()
        ticker = nil
        state = .finished
        commandedWatts = nil
        lastSentWatts = nil
        position = nil
        let duration = completed ? totalDuration : elapsed
        stats = recorder.liveStats()
        lastRecord = recorder.makeRecord(duration: duration, completed: completed)
        Task { [weak self] in await self?.releaseControl() }
    }

    /// Back to the library after a summary has been dismissed.
    public func reset() {
        ticker?.cancel()
        ticker = nil
        state = .idle
        workout = nil
        timeline = nil
        position = nil
        elapsed = 0
        commandedWatts = nil
        plannedWatts = nil
        stats = LiveStats()
    }
}
