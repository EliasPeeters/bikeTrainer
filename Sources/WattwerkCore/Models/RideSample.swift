import Foundation

/// One second of a ride, as recorded.
public struct RideSample: Hashable, Sendable, Codable {
    public var elapsed: TimeInterval
    public var power: Int
    public var targetPower: Int?
    public var cadence: Int?
    public var heartRate: Int?
    /// km/h as reported by the trainer (many trainers derive this from power).
    public var speed: Double?

    public init(
        elapsed: TimeInterval,
        power: Int,
        targetPower: Int? = nil,
        cadence: Int? = nil,
        heartRate: Int? = nil,
        speed: Double? = nil
    ) {
        self.elapsed = elapsed
        self.power = power
        self.targetPower = targetPower
        self.cadence = cadence
        self.heartRate = heartRate
        self.speed = speed
    }
}

/// The most recent values coming off the sensors, independent of any workout.
public struct LiveReadings: Hashable, Sendable {
    public var power: Int?
    public var cadence: Int?
    public var heartRate: Int?
    public var speed: Double?
    public var distance: Double?
    public var powerUpdatedAt: Date?
    public var heartRateUpdatedAt: Date?

    public init() {}

    /// Sensors go quiet when the rider stops pedalling; treat stale data as zero
    /// rather than freezing the last number on screen.
    public func isStale(now: Date = Date(), timeout: TimeInterval = 5) -> Bool {
        guard let powerUpdatedAt else { return true }
        return now.timeIntervalSince(powerUpdatedAt) > timeout
    }
}
