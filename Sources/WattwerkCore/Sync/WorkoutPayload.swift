import Foundation

/// Sichtbarkeit eines Programms.
public enum WorkoutVisibility: String, Codable, Hashable, Sendable, CaseIterable {
    case `private`
    case `public`

    public var localizedName: String {
        switch self {
        case .private: return "Privat"
        case .public: return "Öffentlich"
        }
    }
}

/// The wire format for a workout, matching `WorkoutDTO` in `@wattwerk/shared`.
///
/// Hand written rather than relying on Swift's synthesized `Codable`: Swift
/// encodes enums with associated values as `{"steady":{"_0":…}}`, which is
/// unreadable from TypeScript and changes shape whenever the Swift model is
/// refactored. The API contract lives here, explicitly.
public struct PowerTargetPayload: Codable, Hashable, Sendable {
    public var type: String
    public var value: Double?

    public init(type: String, value: Double? = nil) {
        self.type = type
        self.value = value
    }

    public init(_ target: PowerTarget) {
        switch target {
        case let .watts(watts):
            self.init(type: "watts", value: Double(watts))
        case let .percentFTP(fraction):
            self.init(type: "percentFTP", value: fraction)
        case .free:
            self.init(type: "free")
        }
    }

    /// Unbekannte Typen werden zu `.free` statt zu einem Fehler: ein neuer
    /// Zieltyp vom Server soll eine ältere App nicht daran hindern, den Rest
    /// des Programms zu laden.
    public var target: PowerTarget {
        switch type {
        case "watts": return .watts(Int((value ?? 0).rounded()))
        case "percentFTP": return .percentFTP(value ?? 0)
        default: return .free
        }
    }
}

public struct WorkoutSegmentPayload: Codable, Hashable, Sendable {
    public var title: String?
    public var durationSeconds: Int
    public var target: PowerTargetPayload
    public var targetEnd: PowerTargetPayload?
    public var cadenceLow: Int?
    public var cadenceHigh: Int?

    public init(_ segment: WorkoutSegment) {
        title = segment.title
        durationSeconds = Int(segment.duration.rounded())
        target = PowerTargetPayload(segment.intensity.startTarget)
        switch segment.intensity {
        case .steady:
            targetEnd = nil
        case let .ramp(_, to):
            targetEnd = PowerTargetPayload(to)
        }
        cadenceLow = segment.cadenceTarget?.lowerBound
        cadenceHigh = segment.cadenceTarget?.upperBound
    }

    public func makeSegment(id: UUID = UUID()) -> WorkoutSegment {
        let intensity: WorkoutSegment.Intensity
        if let targetEnd {
            intensity = .ramp(from: target.target, to: targetEnd.target)
        } else {
            intensity = .steady(target.target)
        }

        var cadence: ClosedRange<Int>?
        if let low = cadenceLow, let high = cadenceHigh, low <= high {
            cadence = low...high
        }

        return WorkoutSegment(
            id: id,
            title: title,
            duration: TimeInterval(max(1, durationSeconds)),
            intensity: intensity,
            cadenceTarget: cadence
        )
    }
}

public struct WorkoutPayload: Codable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var summary: String
    public var tags: [String]
    public var visibility: String
    public var segments: [WorkoutSegmentPayload]
    public var durationSeconds: Int
    public var plannedTSS: Int
    public var isBuiltIn: Bool
    public var ownerUserID: Int?
    public var ownerName: String?
    public var createdAt: String?
    public var updatedAt: String?

    public init(_ workout: Workout, referenceFTP: Int = 200) {
        id = workout.id.uuidString.lowercased()
        name = workout.name
        summary = workout.summary
        tags = workout.tags
        visibility = workout.visibility.rawValue
        segments = workout.segments.map(WorkoutSegmentPayload.init)
        durationSeconds = Int(workout.duration.rounded())
        plannedTSS = workout.plannedTSS(ftp: referenceFTP)
        isBuiltIn = workout.isBuiltIn
        ownerUserID = workout.ownerUserID
        ownerName = workout.ownerName
        createdAt = ISO8601DateFormatter().string(from: workout.createdAt)
        updatedAt = ISO8601DateFormatter().string(from: workout.updatedAt)
    }

    public func makeWorkout() -> Workout {
        Workout(
            id: UUID(uuidString: id) ?? UUID(),
            name: name,
            summary: summary,
            tags: tags,
            segments: segments.map { $0.makeSegment() },
            isBuiltIn: isBuiltIn,
            visibility: WorkoutVisibility(rawValue: visibility) ?? .private,
            ownerUserID: ownerUserID,
            ownerName: ownerName,
            createdAt: WorkoutPayload.date(from: createdAt) ?? Date(),
            updatedAt: WorkoutPayload.date(from: updatedAt) ?? Date()
        )
    }

    /// Der Server schickt ISO-8601 mit Bruchteilen von Sekunden, Swifts
    /// Standardformatierer kennt die nicht - beide Varianten werden versucht.
    static func date(from string: String?) -> Date? {
        guard let string else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: string) { return date }
        return ISO8601DateFormatter().date(from: string)
    }
}
