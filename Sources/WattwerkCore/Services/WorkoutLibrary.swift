import Foundation
import Observation

/// The workout catalogue: the built-ins the app ships with plus whatever the
/// rider has created. User workouts are persisted as one JSON blob.
@MainActor
@Observable
public final class WorkoutLibrary {
    private static let key = "workouts"

    public private(set) var userWorkouts: [Workout] = []
    public let builtInWorkouts: [Workout]

    @ObservationIgnored private let storage: any KeyValueStorage

    public init(storage: any KeyValueStorage, builtIn: [Workout] = BuiltInWorkouts.all) {
        self.storage = storage
        self.builtInWorkouts = builtIn
        load()
    }

    /// User workouts first - the things you made are the things you ride.
    public var allWorkouts: [Workout] {
        userWorkouts.sorted { $0.createdAt > $1.createdAt } + builtInWorkouts
    }

    public func workout(id: UUID) -> Workout? {
        allWorkouts.first { $0.id == id }
    }

    public func add(_ workout: Workout) {
        var copy = workout
        copy.isBuiltIn = false
        userWorkouts.append(copy)
        persist()
    }

    /// Saves an edit. Editing a built-in silently forks it into the user library,
    /// so the shipped catalogue always stays intact.
    @discardableResult
    public func save(_ workout: Workout) -> Workout {
        if workout.isBuiltIn {
            let fork = workout.duplicated(named: workout.name)
            userWorkouts.append(fork)
            persist()
            return fork
        }
        if let index = userWorkouts.firstIndex(where: { $0.id == workout.id }) {
            userWorkouts[index] = workout
        } else {
            userWorkouts.append(workout)
        }
        persist()
        return workout
    }

    /// Ersetzt die eigenen Programme durch den Stand des Servers.
    ///
    /// Mitgelieferte Programme bleiben unangetastet - sie liegen in der App und
    /// sind auch ohne Konto da.
    public func replaceUserWorkouts(_ workouts: [Workout]) {
        userWorkouts = workouts.map { workout in
            var copy = workout
            copy.isBuiltIn = false
            return copy
        }
        persist()
    }

    /// Löst die eigenen Programme vom Konto.
    ///
    /// Nach einer Kontolöschung bleiben sie auf dem Gerät - sie gehören dem
    /// Fahrer, nicht dem Konto. Ohne das Zurücksetzen von `syncedAt` würden sie
    /// bei einem neuen Konto für "schon abgeglichen" gehalten und nie hochgeladen.
    public func detachFromAccount() {
        userWorkouts = userWorkouts.map { workout in
            var copy = workout
            copy.ownerUserID = nil
            copy.ownerName = nil
            copy.syncedAt = nil
            copy.visibility = .private
            return copy
        }
        persist()
    }

    public func delete(id: UUID) {
        userWorkouts.removeAll { $0.id == id }
        persist()
    }

    @discardableResult
    public func duplicate(_ workout: Workout) -> Workout {
        let copy = workout.duplicated()
        userWorkouts.append(copy)
        persist()
        return copy
    }

    // MARK: Import / export - plain JSON so workouts are shareable by file or chat.

    public func exportData(_ workouts: [Workout]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(workouts)
    }

    @discardableResult
    public func importWorkouts(from data: Data) throws -> [Workout] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded: [Workout]
        if let many = try? decoder.decode([Workout].self, from: data) {
            decoded = many
        } else {
            decoded = [try decoder.decode(Workout.self, from: data)]
        }
        let imported = decoded.map { workout -> Workout in
            var copy = workout
            copy.id = UUID()
            copy.isBuiltIn = false
            return copy
        }
        userWorkouts.append(contentsOf: imported)
        persist()
        return imported
    }

    private func load() {
        guard let data = storage.data(forKey: Self.key) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        userWorkouts = (try? decoder.decode([Workout].self, from: data)) ?? []
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(userWorkouts) else { return }
        storage.set(data, forKey: Self.key)
    }
}
