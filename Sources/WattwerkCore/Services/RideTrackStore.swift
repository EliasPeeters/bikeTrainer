import Foundation

/// Zwischenlager für Sekundenspuren auf Geräten, die sie nicht im Verlauf
/// behalten können.
///
/// Auf dem Apple TV gibt es nur `UserDefaults` mit rund 500 kB, und der Verlauf
/// wird ohne Spur gespeichert - sonst wäre er nach ein paar Fahrten voll. Ohne
/// dieses Zwischenlager ginge die Kurve aber genau dann verloren, wenn sie am
/// wenigsten verzichtbar ist: bei einer Fahrt, die mangels Netz noch nicht
/// hochgeladen ist. Hier liegt sie komprimiert, bis der Server sie hat, und
/// wird danach weggeräumt.
///
/// Eine Spur je Schlüssel statt alle zusammen in einem: sonst schriebe jede
/// gespeicherte Fahrt sämtliche Kurven neu, und in `UserDefaults` würde aus dem
/// Binärblock eine Base64-Zeichenkette - ein Drittel mehr auf einem Budget, das
/// ohnehin knapp ist.
@MainActor
public final class RideTrackStore {
    /// Was alle zwischengelagerten Spuren zusammen belegen dürfen.
    ///
    /// Eine Stunde Fahrt ist komprimiert rund 14 kB, hier passen also etwa zehn
    /// ausstehende Einheiten hinein - weit mehr, als realistisch auflaufen. Der
    /// Rest des tvOS-Budgets von 500 kB gehört dem Verlauf selbst und der
    /// Bibliothek; wer sich hier zu viel nimmt, drängt sie hinaus.
    public static let budgetBytes = 150_000

    private static let indexKey = "sessionTrackIndex"

    private let storage: any KeyValueStorage
    /// Kennung der Einheit zu Größe in Bytes, älteste zuerst.
    private var index: [(id: UUID, bytes: Int)] = []

    public init(storage: any KeyValueStorage) {
        self.storage = storage
        loadIndex()
    }

    public var storedIDs: [UUID] { index.map(\.id) }

    /// Legt die Spur ab. Passt sie nicht mehr ins Budget, weichen die ältesten.
    public func store(_ track: RideTrack, for id: UUID) {
        guard let data = Self.encode(track) else { return }
        remove(id: id)

        // Eine einzelne Spur, die allein schon zu groß ist, wird nicht
        // gespeichert - statt dafür alle anderen zu räumen und am Ende doch
        // nicht zu passen.
        guard data.count <= Self.budgetBytes else { return }

        storage.set(data, forKey: Self.key(for: id))
        index.append((id: id, bytes: data.count))

        while index.reduce(0, { $0 + $1.bytes }) > Self.budgetBytes, let oldest = index.first {
            remove(id: oldest.id)
        }
        persistIndex()
    }

    public func track(for id: UUID) -> RideTrack? {
        guard let data = storage.data(forKey: Self.key(for: id)) else { return nil }
        return Self.decode(data)
    }

    public func remove(id: UUID) {
        guard let position = index.firstIndex(where: { $0.id == id }) else { return }
        index.remove(at: position)
        storage.set(nil, forKey: Self.key(for: id))
        persistIndex()
    }

    public func removeAll() {
        for entry in index {
            storage.set(nil, forKey: Self.key(for: entry.id))
        }
        index = []
        persistIndex()
    }

    /// Räumt Spuren weg, zu denen es keine Einheit mehr gibt.
    ///
    /// Nötig, weil eine Einheit auch außerhalb dieses Ladens verschwinden kann -
    /// etwa wenn der Verlauf über sein Limit läuft und hinten abschneidet.
    public func pruneTracks(keeping ids: Set<UUID>) {
        for entry in index where !ids.contains(entry.id) {
            remove(id: entry.id)
        }
    }

    // MARK: Innenleben

    private static func key(for id: UUID) -> String {
        "sessionTrack.\(id.uuidString)"
    }

    /// JSON, dann zlib. Eine Sekundenspur besteht fast nur aus kurzen Zahlen
    /// und Kommas und schrumpft dabei auf ein Fünftel bis ein Viertel.
    private static func encode(_ track: RideTrack) -> Data? {
        guard let json = try? JSONEncoder().encode(track) else { return nil }
        return try? (json as NSData).compressed(using: .zlib) as Data
    }

    private static func decode(_ data: Data) -> RideTrack? {
        guard let json = try? (data as NSData).decompressed(using: .zlib) as Data else { return nil }
        return try? JSONDecoder().decode(RideTrack.self, from: json)
    }

    private struct IndexEntry: Codable {
        var id: UUID
        var bytes: Int
    }

    private func loadIndex() {
        guard let data = storage.data(forKey: Self.indexKey),
              let entries = try? JSONDecoder().decode([IndexEntry].self, from: data)
        else { return }
        index = entries.map { (id: $0.id, bytes: $0.bytes) }
    }

    private func persistIndex() {
        let entries = index.map { IndexEntry(id: $0.id, bytes: $0.bytes) }
        storage.set(try? JSONEncoder().encode(entries), forKey: Self.indexKey)
    }
}
