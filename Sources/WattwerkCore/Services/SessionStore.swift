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
    /// Nur dort benutzt, wo der Verlauf die Spur nicht mitträgt - siehe
    /// `RideTrackStore`.
    @ObservationIgnored private let tracks: RideTrackStore

    public init(
        storage: any KeyValueStorage,
        keepsSampleTracks: Bool = StorageFactory.storesSampleTracks,
        limit: Int = 200
    ) {
        self.storage = storage
        self.keepsSampleTracks = keepsSampleTracks
        self.limit = limit
        self.tracks = RideTrackStore(storage: storage)
        load()
        // Was beim letzten Start liegen blieb, weil die Einheit inzwischen aus
        // dem Verlauf gefallen ist.
        tracks.pruneTracks(keeping: Set(sessions.map(\.id)))
    }

    public func add(_ record: SessionRecord) {
        // Hier wird nichts mehr aussortiert.
        //
        // Vorher flogen Fahrten unter einer Minute raus - "die zählt ja nicht".
        // Nur wird `add` ausschließlich dann gerufen, wenn jemand auf der
        // Auswertung „Speichern“ gedrückt hat, und daneben steht „Verwerfen“.
        // Die Entscheidung war also längst getroffen; die Schwelle hat sie
        // stillschweigend überstimmt. Wer eine kurze Fahrt nicht behalten will,
        // sagt das mit dem anderen Knopf.
        if keepsSampleTracks {
            sessions.insert(record, at: 0)
        } else {
            // Der Verlauf bekommt nur die Zusammenfassung, die Spur wandert
            // daneben ins Zwischenlager - und von dort beim nächsten Abgleich
            // zum Server. Vorher war sie an dieser Stelle einfach weg.
            sessions.insert(record.withoutSamples(), at: 0)
            if let track = RideTrack(samples: record.samples) {
                tracks.store(track, for: record.id)
            }
        }

        if sessions.count > limit {
            let dropped = sessions.suffix(sessions.count - limit)
            sessions.removeLast(sessions.count - limit)
            for entry in dropped {
                tracks.remove(id: entry.id)
            }
        }
        persist()
    }

    /// Der Sekundenverlauf einer Einheit, egal wo er gerade liegt.
    ///
    /// Auf macOS und iOS steckt er in der Einheit selbst, auf dem Apple TV im
    /// Zwischenlager. Die Aufrufer - Diagramm, CSV-Export, Upload - sollen den
    /// Unterschied nicht kennen müssen.
    public func track(for record: SessionRecord) -> RideTrack? {
        RideTrack(samples: record.samples) ?? tracks.track(for: record.id)
    }

    /// Die Punkte derselben Spur, für Diagramm und Export.
    public func samples(for record: SessionRecord) -> [RideSample] {
        record.samples.isEmpty ? (tracks.track(for: record.id)?.makeSamples() ?? []) : record.samples
    }

    /// Alles, was noch nicht beim Server ist - älteste zuerst, damit der
    /// Verlauf in der richtigen Reihenfolge ankommt.
    public var pendingUploads: [SessionRecord] {
        sessions.filter { $0.uploadedAt == nil }.sorted { $0.startedAt < $1.startedAt }
    }

    public func markUploaded(id: UUID, at date: Date = Date()) {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else { return }
        sessions[index].uploadedAt = date
        // Angekommen heißt: der Server hat die Kurve. Das Zwischenlager ist
        // nur für den Weg dorthin da.
        tracks.remove(id: id)
        persist()
    }

    /// Nach einer Kontolöschung: alles gilt wieder als nicht hochgeladen,
    /// damit es bei einem neuen Konto mitgeht.
    public func detachFromAccount() {
        sessions = sessions.map { session in
            var copy = session
            copy.uploadedAt = nil
            return copy
        }
        persist()
    }

    public func delete(id: UUID) {
        sessions.removeAll { $0.id == id }
        tracks.remove(id: id)
        persist()
    }

    public func deleteAll() {
        sessions.removeAll()
        tracks.removeAll()
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
