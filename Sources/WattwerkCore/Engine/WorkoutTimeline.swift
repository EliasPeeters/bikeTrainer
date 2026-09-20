import Foundation

/// Turns a workout plus an FTP into "where am I and what should I be doing right now".
///
/// Pure value type: no clock, no state. The engine feeds it an elapsed time.
public struct WorkoutTimeline: Sendable {
    public struct Position: Hashable, Sendable {
        public let segmentIndex: Int
        public let segment: WorkoutSegment
        public let segmentStart: TimeInterval
        public let segmentElapsed: TimeInterval
        public let target: PowerTarget

        public var segmentRemaining: TimeInterval {
            max(0, segment.duration - segmentElapsed)
        }

        public var segmentProgress: Double {
            guard segment.duration > 0 else { return 1 }
            return min(max(segmentElapsed / segment.duration, 0), 1)
        }
    }

    public let workout: Workout
    public let ftp: Int
    /// Absolute start time of every segment, plus the total duration as a sentinel.
    private let boundaries: [TimeInterval]

    public init(workout: Workout, ftp: Int) {
        self.workout = workout
        self.ftp = max(1, ftp)
        var running: TimeInterval = 0
        var boundaries: [TimeInterval] = [0]
        for segment in workout.segments {
            running += segment.duration
            boundaries.append(running)
        }
        self.boundaries = boundaries
    }

    public var duration: TimeInterval { boundaries.last ?? 0 }

    public func startTime(ofSegment index: Int) -> TimeInterval {
        guard index >= 0, index < boundaries.count else { return duration }
        return boundaries[index]
    }

    /// `nil` once the workout has run past its end.
    public func position(at elapsed: TimeInterval) -> Position? {
        guard !workout.segments.isEmpty, elapsed < duration else { return nil }
        let clamped = max(0, elapsed)
        let index = segmentIndex(at: clamped)
        let segment = workout.segments[index]
        let start = boundaries[index]
        let inSegment = clamped - start
        let progress = segment.duration > 0 ? inSegment / segment.duration : 1
        return Position(
            segmentIndex: index,
            segment: segment,
            segmentStart: start,
            segmentElapsed: inSegment,
            target: segment.target(at: progress, ftp: ftp)
        )
    }

    public func segment(after index: Int) -> WorkoutSegment? {
        let next = index + 1
        guard next < workout.segments.count else { return nil }
        return workout.segments[next]
    }

    private func segmentIndex(at elapsed: TimeInterval) -> Int {
        // Binary search over the boundary list; workouts with 100+ segments are normal
        // (think Tabata blocks) and this runs on every tick.
        var low = 0
        var high = workout.segments.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if boundaries[mid] <= elapsed {
                low = mid
            } else {
                high = mid - 1
            }
        }
        return low
    }
}
