import Foundation
import Observation

/// Ride history. Newest first, capped so that the tvOS key/value budget holds.
@MainActor
@Observable
public final class SessionStore {
    private static let key = "sessions"

    public private(set) var sessions: [SessionRecord] = []

    @ObservationIgnored private let storage: any KeyValueStorage
    @ObservationIgnored private let keepsSampleTracks: Bool
    @ObservationIgnored private let limit: Int

    public init(
        storage: any KeyValueStorage,
        keepsSampleTracks: Bool = StorageFactory.storesSampleTracks,
        limit: Int = 200
    ) {
        self.storage = storage
        self.keepsSampleTracks = keepsSampleTracks
        self.limit = limit
        load()
    }

    public func add(_ record: SessionRecord) {
        // A ride that never got going is not worth keeping.
        guard record.duration >= 60 else { return }
        let stored = keepsSampleTracks ? record : record.withoutSamples()
        sessions.insert(stored, at: 0)
        if sessions.count > limit {
            sessions.removeLast(sessions.count - limit)
        }
        persist()
    }

    /// Alles, was noch nicht beim Server ist - älteste zuerst, damit der
    /// Verlauf in der richtigen Reihenfolge ankommt.
    public var pendingUploads: [SessionRecord] {
        sessions.filter { $0.uploadedAt == nil }.sorted { $0.startedAt < $1.startedAt }
    }

    public func markUploaded(id: UUID, at date: Date = Date()) {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else { return }
        sessions[index].uploadedAt = date
        persist()
    }

    public func delete(id: UUID) {
        sessions.removeAll { $0.id == id }
        persist()
    }

    public func deleteAll() {
        sessions.removeAll()
        persist()
    }

    /// Summed training stress of the last seven days - the one number that tells
    /// you whether this week was real training or not.
    public func stressLast(days: Int, now: Date = Date()) -> Int {
        let cutoff = now.addingTimeInterval(-Double(days) * 86400)
        return sessions
            .filter { $0.startedAt >= cutoff }
            .reduce(0) { $0 + $1.trainingStressScore }
    }

    private func load() {
        guard let data = storage.data(forKey: Self.key) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        sessions = (try? decoder.decode([SessionRecord].self, from: data)) ?? []
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(sessions) else { return }
        storage.set(data, forKey: Self.key)
    }
}
