import Foundation

/// A single block of a workout: "5 Minuten bei 60 % FTP".
public struct WorkoutSegment: Identifiable, Hashable, Sendable, Codable {
    /// Constant power, or a linear ramp between two targets.
    public enum Intensity: Hashable, Sendable, Codable {
        case steady(PowerTarget)
        case ramp(from: PowerTarget, to: PowerTarget)

        /// The target at a given progress (0...1) through the segment.
        public func target(at progress: Double, ftp: Int) -> PowerTarget {
            switch self {
            case let .steady(target):
                return target
            case let .ramp(from, to):
                return PowerTarget.interpolate(from: from, to: to, progress: progress, ftp: ftp)
            }
        }

        public var startTarget: PowerTarget {
            switch self {
            case let .steady(target): return target
            case let .ramp(from, _): return from
            }
        }

        public var endTarget: PowerTarget {
            switch self {
            case let .steady(target): return target
            case let .ramp(_, to): return to
            }
        }

        public var isFree: Bool {
            startTarget.isFree && endTarget.isFree
        }
    }

    public var id: UUID
    /// Optional label, e.g. "Intervall 3/5". Falls back to a generated description.
    public var title: String?
    public var duration: TimeInterval
    public var intensity: Intensity
    /// Optional cadence guidance, shown as a hint during the ride.
    public var cadenceTarget: ClosedRange<Int>?

    public init(
        id: UUID = UUID(),
        title: String? = nil,
        duration: TimeInterval,
        intensity: Intensity,
        cadenceTarget: ClosedRange<Int>? = nil
    ) {
        self.id = id
        self.title = title
        self.duration = max(1, duration)
        self.intensity = intensity
        self.cadenceTarget = cadenceTarget
    }

    // MARK: Convenience constructors

    public static func steady(
        _ duration: TimeInterval,
        percentFTP: Double,
        title: String? = nil,
        cadence: ClosedRange<Int>? = nil
    ) -> WorkoutSegment {
        WorkoutSegment(
            title: title,
            duration: duration,
            intensity: .steady(.percentFTP(percentFTP)),
            cadenceTarget: cadence
        )
    }

    public static func steady(
        _ duration: TimeInterval,
        watts: Int,
        title: String? = nil,
        cadence: ClosedRange<Int>? = nil
    ) -> WorkoutSegment {
        WorkoutSegment(
            title: title,
            duration: duration,
            intensity: .steady(.watts(watts)),
            cadenceTarget: cadence
        )
    }

    public static func ramp(
        _ duration: TimeInterval,
        fromPercentFTP: Double,
        toPercentFTP: Double,
        title: String? = nil,
        cadence: ClosedRange<Int>? = nil
    ) -> WorkoutSegment {
        WorkoutSegment(
            title: title,
            duration: duration,
            intensity: .ramp(from: .percentFTP(fromPercentFTP), to: .percentFTP(toPercentFTP)),
            cadenceTarget: cadence
        )
    }

    public static func free(_ duration: TimeInterval, title: String? = nil) -> WorkoutSegment {
        WorkoutSegment(title: title, duration: duration, intensity: .steady(.free))
    }

    // MARK: Derived

    public func target(at progress: Double, ftp: Int) -> PowerTarget {
        intensity.target(at: progress, ftp: ftp)
    }

    /// Average wattage of the segment, used for workout-level TSS estimates.
    public func averageWatts(ftp: Int) -> Int? {
        let start = intensity.startTarget.resolvedWatts(ftp: ftp)
        let end = intensity.endTarget.resolvedWatts(ftp: ftp)
        switch (start, end) {
        case let (a?, b?): return (a + b) / 2
        case let (a?, nil): return a
        case let (nil, b?): return b
        default: return nil
        }
    }

    public func zone(ftp: Int) -> PowerZone? {
        guard let watts = averageWatts(ftp: ftp) else { return nil }
        return PowerZone(watts: watts, ftp: ftp)
    }

    /// Human readable label for lists and the editor.
    public func displayTitle(ftp: Int) -> String {
        if let title, !title.isEmpty { return title }
        let minutes = Formatting.compactDuration(duration)
        switch intensity {
        case let .steady(target):
            switch target {
            case .free: return "\(minutes) frei"
            default:
                let watts = target.resolvedWatts(ftp: ftp) ?? 0
                return "\(minutes) @ \(watts) W"
            }
        case let .ramp(from, to):
            let a = from.resolvedWatts(ftp: ftp) ?? 0
            let b = to.resolvedWatts(ftp: ftp) ?? 0
            return "\(minutes) \(a) → \(b) W"
        }
    }
}
