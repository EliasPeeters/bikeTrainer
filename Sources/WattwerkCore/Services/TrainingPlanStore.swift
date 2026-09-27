import Foundation
import Observation

/// Der Wochenplan: welches Programm an welchem Wochentag dran ist.
///
/// Einmal angelegt, gilt er jede Woche. Er liegt unter einem eigenen
/// Schlüssel, damit Fassungen vor 1.1 nichts davon merken - sie lesen den
/// Schlüssel nie, und diese Fassung liest ohne ihn einen leeren Plan.
@MainActor
@Observable
public final class TrainingPlanStore {
    private static let key = "plan"

    public private(set) var entries: [PlanEntry] = []
    /// Wann der Plan zuletzt auf diesem Gerät geändert wurde. `nil`: nie.
    public private(set) var updatedAt: Date?
    /// Wann er zuletzt mit dem Server abgeglichen wurde. `nil`: nie.
    public private(set) var syncedAt: Date?

    @ObservationIgnored private let storage: any KeyValueStorage

    public init(storage: any KeyValueStorage) {
        self.storage = storage
        load()
    }

    public var isEmpty: Bool { entries.isEmpty }

    /// In der Reihenfolge, in der sie eingeplant wurden.
    public func entries(on weekday: Weekday) -> [PlanEntry] {
        entries.filter { $0.weekday == weekday }
    }

    // MARK: Ändern

    /// Plant `workout` an `weekday` ein.
    ///
    /// `keepsCopy` legt eine Kopie des Programms in den Eintrag - für
    /// Programme, die nicht in der eigenen Bibliothek liegen und sich später
    /// sonst nicht mehr finden ließen.
    @discardableResult
    public func add(_ workout: Workout, on weekday: Weekday, keepsCopy: Bool = false, at date: Date = Date()) -> PlanEntry {
        let entry = PlanEntry(
            weekday: weekday,
            workoutID: workout.id,
            workoutName: workout.name,
            workout: keepsCopy ? workout : nil,
            createdAt: date
        )
        entries.append(entry)
        markChanged(at: date)
        return entry
    }

    public func remove(id: UUID, at date: Date = Date()) {
        guard entries.contains(where: { $0.id == id }) else { return }
        entries.removeAll { $0.id == id }
        markChanged(at: date)
    }

    /// Legt einen Eintrag auf einen anderen Tag. Dort kommt er ans Ende.
    public func move(id: UUID, to weekday: Weekday, at date: Date = Date()) {
        guard let index = entries.firstIndex(where: { $0.id == id }),
              entries[index].weekday != weekday
        else { return }
        var entry = entries.remove(at: index)
        entry.weekday = weekday
        entries.append(entry)
        markChanged(at: date)
    }

    /// Nimmt ein gelöschtes Programm aus dem Plan - sonst stünde dort ein
    /// Eintrag, der sich nicht mehr fahren lässt.
    public func removeEntries(forWorkout workoutID: UUID, at date: Date = Date()) {
        guard entries.contains(where: { $0.workoutID == workoutID }) else { return }
        entries.removeAll { $0.workoutID == workoutID }
        markChanged(at: date)
    }

    // MARK: Abgleich

    /// Ob der Server den Stand dieses Geräts bekommen soll.
    ///
    /// Anders als beim Profil gilt „noch nie abgeglichen“ hier nicht
    /// automatisch als „hochschieben“: ein Apple TV, das frisch angemeldet
    /// wird, hat einen leeren Plan und würde damit den am Mac angelegten
    /// überschreiben. Nie abgeglichen und nie geändert heißt deshalb: der
    /// Server gewinnt. Nie abgeglichen, aber geändert heißt: zusammenführen,
    /// siehe `merged(with:)`.
    public var needsUpload: Bool {
        guard let updatedAt else { return false }
        guard let syncedAt else { return true }
        return updatedAt > syncedAt
    }

    /// `true`, wenn noch nie abgeglichen wurde - dann wird zusammengeführt
    /// statt überschrieben.
    public var hasNeverSynced: Bool { syncedAt == nil }

    /// Der eigene Plan plus alles vom Server, was hier noch fehlt.
    ///
    /// Für den ersten Abgleich eines Plans, der ohne Konto entstanden ist:
    /// weder soll der Server den lokalen Plan wegwischen, noch der lokale den,
    /// den jemand schon auf einem anderen Gerät angelegt hat. Ein Programm, das
    /// auf beiden Seiten am selben Tag steht, zählt dabei nur einmal.
    public func merged(with remote: [PlanEntry]) -> [PlanEntry] {
        var result = entries
        for entry in remote {
            let duplicate = result.contains {
                $0.id == entry.id || ($0.weekday == entry.weekday && $0.workoutID == entry.workoutID)
            }
            if !duplicate { result.append(entry) }
        }
        return result
    }

    /// Übernimmt den Stand des Servers, ohne ihn als lokal geändert zu führen.
    public func applyRemote(_ remote: [PlanEntry], at date: Date = Date()) {
        entries = remote
        syncedAt = date
        persist()
    }

    public func markSynced(at date: Date = Date()) {
        syncedAt = date
        persist()
    }

    /// Nach einer Kontolöschung: der Plan bleibt, gilt aber wieder als nie
    /// abgeglichen - bei einem neuen Konto wird er dann zusammengeführt.
    public func detachFromAccount() {
        syncedAt = nil
        // Ein Plan, den es gibt, soll beim nächsten Konto auch ankommen.
        if !entries.isEmpty, updatedAt == nil { updatedAt = Date() }
        persist()
    }

    // MARK: Speichern

    private func markChanged(at date: Date) {
        updatedAt = date
        persist()
    }

    private func load() {
        guard let data = storage.data(forKey: Self.key) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let stored = try? decoder.decode(StoredPlan.self, from: data) else { return }
        entries = stored.entries
        updatedAt = stored.updatedAt
        syncedAt = stored.syncedAt
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let stored = StoredPlan(entries: entries, updatedAt: updatedAt, syncedAt: syncedAt)
        guard let data = try? encoder.encode(stored) else { return }
        storage.set(data, forKey: Self.key)
    }
}

/// Was unter dem Schlüssel `plan` liegt.
struct StoredPlan: Codable {
    var entries: [PlanEntry]
    var updatedAt: Date?
    var syncedAt: Date?

    init(entries: [PlanEntry], updatedAt: Date?, syncedAt: Date?) {
        self.entries = entries
        self.updatedAt = updatedAt
        self.syncedAt = syncedAt
    }

    /// Ein Eintrag, der sich nicht lesen lässt - etwa ein Wochentag, den eine
    /// spätere Fassung eingeführt hat - fällt allein heraus, statt den ganzen
    /// Plan mitzunehmen.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        entries = (try container.decodeIfPresent([Lossy<PlanEntry>].self, forKey: .entries) ?? [])
            .compactMap(\.value)
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt)
        syncedAt = try container.decodeIfPresent(Date.self, forKey: .syncedAt)
    }
}

/// Dekodiert einen Wert oder eben nicht - ohne das umgebende Feld scheitern zu lassen.
struct Lossy<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: any Decoder) throws {
        value = try? Value(from: decoder)
    }
}
