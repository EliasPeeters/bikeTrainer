import Foundation

/// Collects one sample per second and turns them into a `SessionRecord`.
@MainActor
public final class SessionRecorder {
    public private(set) var samples: [RideSample] = []
    public private(set) var startedAt: Date = Date()

    private var workoutID: UUID?
    private var workoutName: String = "Freie Fahrt"
    private var ftp: Int = 200

    public init() {}

    public func begin(workout: Workout?, ftp: Int, at date: Date = Date()) {
        samples.removeAll(keepingCapacity: true)
        workoutID = workout?.id
        workoutName = workout?.name ?? "Freie Fahrt"
        self.ftp = max(1, ftp)
        startedAt = date
    }

    public func append(_ sample: RideSample) {
        samples.append(sample)
    }

    public var isEmpty: Bool { samples.isEmpty }

    /// Recomputed once per second for the ride screen.
    public func liveStats() -> LiveStats {
        var stats = LiveStats()
        guard !samples.isEmpty else { return stats }
        let watts = samples.map(\.power)
        stats.averagePower = PowerMath.average(watts)
        stats.normalizedPower = PowerMath.normalizedPower(watts)
        stats.maxPower = watts.max() ?? 0
        stats.kilojoules = PowerMath.kilojoules(watts)
        let cadences = samples.compactMap(\.cadence).filter { $0 > 0 }
        stats.averageCadence = cadences.isEmpty ? nil : PowerMath.average(cadences)
        let heartRates = samples.compactMap(\.heartRate).filter { $0 > 0 }
        stats.averageHeartRate = heartRates.isEmpty ? nil : PowerMath.average(heartRates)
        return stats
    }

    public func makeRecord(duration: TimeInterval, completed: Bool) -> SessionRecord {
        let watts = samples.map(\.power)
        let normalized = PowerMath.normalizedPower(watts)
        let cadences = samples.compactMap(\.cadence).filter { $0 > 0 }
        let heartRates = samples.compactMap(\.heartRate).filter { $0 > 0 }

        var buckets: [PowerZone: TimeInterval] = [:]
        for sample in samples {
            let zone = PowerZone(watts: sample.power, ftp: ftp)
            buckets[zone, default: 0] += 1
        }

        return SessionRecord(
            workoutID: workoutID,
            workoutName: workoutName,
            startedAt: startedAt,
            duration: duration,
            completed: completed,
            ftp: ftp,
            averagePower: PowerMath.average(watts),
            maxPower: watts.max() ?? 0,
            normalizedPower: normalized,
            intensityFactor: PowerMath.intensityFactor(normalizedPower: normalized, ftp: ftp),
            trainingStressScore: PowerMath.trainingStressScore(
                duration: duration,
                normalizedPower: normalized,
                ftp: ftp
            ),
            kilojoules: PowerMath.kilojoules(watts),
            averageCadence: cadences.isEmpty ? nil : PowerMath.average(cadences),
            averageHeartRate: heartRates.isEmpty ? nil : PowerMath.average(heartRates),
            maxHeartRate: heartRates.max(),
            timeInZone: PowerZone.allCases.compactMap { zone in
                guard let seconds = buckets[zone], seconds > 0 else { return nil }
                return SessionRecord.ZoneBucket(zone: zone, seconds: seconds)
            },
            samples: samples
        )
    }
}
