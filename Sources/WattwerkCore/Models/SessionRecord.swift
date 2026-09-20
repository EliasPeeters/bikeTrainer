import Foundation

/// What is left over after a ride: the numbers, and optionally the full track.
public struct SessionRecord: Identifiable, Hashable, Sendable, Codable {
    public struct ZoneBucket: Hashable, Sendable, Codable {
        public var zone: PowerZone
        public var seconds: TimeInterval

        public init(zone: PowerZone, seconds: TimeInterval) {
            self.zone = zone
            self.seconds = seconds
        }
    }

    public var id: UUID
    public var workoutID: UUID?
    public var workoutName: String
    public var startedAt: Date
    public var duration: TimeInterval
    /// Whether the rider made it to the end or bailed out early.
    public var completed: Bool
    public var ftp: Int

    public var averagePower: Int
    public var maxPower: Int
    public var normalizedPower: Int
    public var intensityFactor: Double
    public var trainingStressScore: Int
    public var kilojoules: Int
    public var averageCadence: Int?
    public var averageHeartRate: Int?
    public var maxHeartRate: Int?
    public var timeInZone: [ZoneBucket]

    /// Per-second track. Dropped on tvOS, where the only persistent storage is
    /// a 500 kB `UserDefaults` bucket - see `SessionStore`.
    public var samples: [RideSample]

    public init(
        id: UUID = UUID(),
        workoutID: UUID? = nil,
        workoutName: String,
        startedAt: Date,
        duration: TimeInterval,
        completed: Bool,
        ftp: Int,
        averagePower: Int,
        maxPower: Int,
        normalizedPower: Int,
        intensityFactor: Double,
        trainingStressScore: Int,
        kilojoules: Int,
        averageCadence: Int? = nil,
        averageHeartRate: Int? = nil,
        maxHeartRate: Int? = nil,
        timeInZone: [ZoneBucket] = [],
        samples: [RideSample] = []
    ) {
        self.id = id
        self.workoutID = workoutID
        self.workoutName = workoutName
        self.startedAt = startedAt
        self.duration = duration
        self.completed = completed
        self.ftp = ftp
        self.averagePower = averagePower
        self.maxPower = maxPower
        self.normalizedPower = normalizedPower
        self.intensityFactor = intensityFactor
        self.trainingStressScore = trainingStressScore
        self.kilojoules = kilojoules
        self.averageCadence = averageCadence
        self.averageHeartRate = averageHeartRate
        self.maxHeartRate = maxHeartRate
        self.timeInZone = timeInZone
        self.samples = samples
    }

    /// Drops the per-second track - used before writing to constrained storage.
    public func withoutSamples() -> SessionRecord {
        var copy = self
        copy.samples = []
        return copy
    }

    /// Spreadsheet friendly export; good enough to get a ride into anything else.
    public func csv() -> String {
        var lines = ["seconds,power,target,cadence,heart_rate,speed_kmh"]
        lines.reserveCapacity(samples.count + 1)
        for sample in samples {
            let fields: [String] = [
                String(Int(sample.elapsed.rounded())),
                String(sample.power),
                sample.targetPower.map(String.init) ?? "",
                sample.cadence.map(String.init) ?? "",
                sample.heartRate.map(String.init) ?? "",
                sample.speed.map { String(format: "%.1f", $0) } ?? "",
            ]
            lines.append(fields.joined(separator: ","))
        }
        return lines.joined(separator: "\n")
    }

    public var suggestedFileName: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HHmm"
        let safeName = workoutName
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: " ", with: "_")
        return "\(formatter.string(from: startedAt))_\(safeName)"
    }
}

/// The subset of the numbers that the ride screen shows while riding.
public struct LiveStats: Hashable, Sendable {
    public var averagePower: Int = 0
    public var normalizedPower: Int = 0
    public var maxPower: Int = 0
    public var kilojoules: Int = 0
    public var averageHeartRate: Int?
    public var averageCadence: Int?

    public init() {}
}
