import Foundation

/// Die Antworttypen der API, passend zu `@wattwerk/shared`.

public struct UserPayload: Codable, Hashable, Sendable {
    public var id: Int
    public var email: String
    public var name: String
    public var mailContactAllowed: Bool
    public var ftp: Int
    public var maxHeartRate: Int
    public var restingHeartRate: Int
    public var weightKg: Double
    public var createdAt: String

    /// Übernimmt die Serverwerte in das lokale Fahrerprofil.
    public func makeRiderProfile(keeping existing: RiderProfile) -> RiderProfile {
        RiderProfile(
            name: name.isEmpty ? existing.name : name,
            ftp: ftp,
            maxHeartRate: maxHeartRate,
            restingHeartRate: restingHeartRate,
            weightKg: weightKg,
            ftpUpdatedAt: existing.ftpUpdatedAt
        )
    }
}

public struct AuthPayload: Codable, Hashable, Sendable {
    public var user: UserPayload
    public var accessToken: String
    public var refreshToken: String
}

public struct TokenPayload: Codable, Hashable, Sendable {
    public var accessToken: String
    public var refreshToken: String
}

public struct SessionPayload: Codable, Hashable, Sendable {
    public var clientID: String
    public var workoutName: String
    public var workoutID: String?
    public var startedAt: String
    public var durationSeconds: Int
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
    /// Der Sekundenverlauf, sofern das Gerät ihn noch hat.
    ///
    /// Wird als eigenes Argument übergeben und nicht aus `record.samples`
    /// gelesen: auf dem Apple TV liegt die Spur nicht in der Einheit, sondern
    /// daneben (siehe `SessionStore`). Fehlt sie, lässt der Server eine bereits
    /// gespeicherte Kurve in Ruhe - ein Nachtrag darf sie nicht löschen.
    public var track: RideTrack?

    public init(_ record: SessionRecord, track: RideTrack? = nil) {
        clientID = record.id.uuidString.lowercased()
        workoutName = record.workoutName
        workoutID = record.workoutID?.uuidString.lowercased()
        startedAt = ISO8601DateFormatter().string(from: record.startedAt)
        durationSeconds = Int(record.duration.rounded())
        completed = record.completed
        ftp = record.ftp
        averagePower = record.averagePower
        maxPower = record.maxPower
        normalizedPower = record.normalizedPower
        intensityFactor = record.intensityFactor
        trainingStressScore = record.trainingStressScore
        kilojoules = record.kilojoules
        averageCadence = record.averageCadence
        averageHeartRate = record.averageHeartRate
        maxHeartRate = record.maxHeartRate
        self.track = track
    }
}

public struct WorkoutListPayload: Codable, Hashable, Sendable {
    public var workouts: [WorkoutPayload]
}

public struct CollectionPayload: Codable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var summary: String
    public var visibility: String
    public var workouts: [WorkoutPayload]
}

public struct CollectionListPayload: Codable, Hashable, Sendable {
    public var collections: [CollectionPayload]
}

public struct DiscoveryRowPayload: Codable, Hashable, Sendable {
    public var key: String
    public var title: String
    public var subtitle: String?
    public var workouts: [WorkoutPayload]
}

public struct DiscoveryPayload: Codable, Hashable, Sendable {
    public var rows: [DiscoveryRowPayload]
    public var collections: [CollectionPayload]
}

/// Der Fehlerkörper der API: ein maschinenlesbarer Code plus ein Satz für Menschen.
public struct APIErrorPayload: Codable, Hashable, Sendable {
    public var error: String
    public var message: String
}

public enum APIError: Error, LocalizedError, Sendable {
    /// Die Verbindung kam nicht zustande. Grund und Adresse stehen mit drin:
    /// "nicht erreichbar" allein verschweigt, ob der Server aus ist, die
    /// Adresse falsch steht oder die Sandbox den Zugriff verbietet - und genau
    /// das ist die Frage, die man an dieser Stelle hat.
    case offline(url: String, reason: String)
    case unauthorized
    case server(code: String, message: String)
    case decoding

    public var errorDescription: String? {
        switch self {
        case let .offline(url, reason):
            return "Keine Verbindung zu " + url + ": " + reason
        case .unauthorized:
            return "Die Anmeldung ist abgelaufen. Bitte neu anmelden."
        case let .server(_, message):
            return message
        case .decoding:
            return "Die Antwort des Servers war unverständlich."
        }
    }
}
