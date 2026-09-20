import Foundation

/// A structured training session: an ordered list of segments plus metadata.
public struct Workout: Identifiable, Hashable, Sendable, Codable {
    public var id: UUID
    public var name: String
    public var summary: String
    public var tags: [String]
    public var segments: [WorkoutSegment]
    /// `true` for the workouts that ship with the app - those cannot be deleted,
    /// only duplicated into the user's own library.
    public var isBuiltIn: Bool
    /// Privat, solange der Fahrer es nicht freigibt.
    public var visibility: WorkoutVisibility
    /// Gesetzt, sobald das Programm auf dem Server liegt.
    public var ownerUserID: Int?
    /// Anzeigename des Urhebers bei fremden, öffentlichen Programmen.
    public var ownerName: String?
    public var createdAt: Date
    /// Entscheidet beim Abgleich, welche Fassung gewinnt.
    public var updatedAt: Date
    /// Wann dieses Programm zuletzt mit dem Server abgeglichen wurde.
    ///
    /// Trägt die Entscheidung, was hochgeschoben wird: nur was neu ist
    /// (`nil`) oder seither geändert wurde. Ohne diese Unterscheidung würde ein
    /// im Web gelöschtes Programm vom nächsten Gerät wieder hochgeladen und
    /// wäre nicht totzukriegen.
    public var syncedAt: Date?

    public init(
        id: UUID = UUID(),
        name: String,
        summary: String = "",
        tags: [String] = [],
        segments: [WorkoutSegment],
        isBuiltIn: Bool = false,
        visibility: WorkoutVisibility = .private,
        ownerUserID: Int? = nil,
        ownerName: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        syncedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.summary = summary
        self.tags = tags
        self.segments = segments
        self.isBuiltIn = isBuiltIn
        self.visibility = visibility
        self.ownerUserID = ownerUserID
        self.ownerName = ownerName
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.syncedAt = syncedAt
    }

    /// Nachsichtiges Dekodieren.
    ///
    /// Programme, die eine frühere Fassung der App gespeichert hat, kennen
    /// `visibility` und `updatedAt` nicht. Ohne Standardwerte schlägt das
    /// Dekodieren der gesamten Bibliothek fehl - und die Einheiten, die jemand
    /// selbst gebaut hat, wären nach einem Update weg.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        segments = try container.decode([WorkoutSegment].self, forKey: .segments)
        isBuiltIn = try container.decodeIfPresent(Bool.self, forKey: .isBuiltIn) ?? false
        visibility = try container.decodeIfPresent(WorkoutVisibility.self, forKey: .visibility) ?? .private
        ownerUserID = try container.decodeIfPresent(Int.self, forKey: .ownerUserID)
        ownerName = try container.decodeIfPresent(String.self, forKey: .ownerName)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
        syncedAt = try container.decodeIfPresent(Date.self, forKey: .syncedAt)
    }

    /// `true`, wenn die lokale Fassung noch nicht beim Server ist.
    public var needsUpload: Bool {
        guard let syncedAt else { return true }
        return updatedAt > syncedAt
    }

    public var duration: TimeInterval {
        segments.reduce(0) { $0 + $1.duration }
    }

    /// Estimated training stress, computed from the planned targets
    /// (the ride itself records the real thing).
    public func plannedTSS(ftp: Int) -> Int {
        guard ftp > 0, duration > 0 else { return 0 }
        // Fourth-power weighting approximates normalized power well enough for a preview.
        var weighted = 0.0
        for segment in segments {
            guard let watts = segment.averageWatts(ftp: ftp) else { continue }
            weighted += pow(Double(watts), 4) * segment.duration
        }
        guard weighted > 0 else { return 0 }
        let normalized = pow(weighted / duration, 0.25)
        let intensityFactor = normalized / Double(ftp)
        let tss = (duration * normalized * intensityFactor) / (Double(ftp) * 3600) * 100
        return Int(tss.rounded())
    }

    public func intensityFactor(ftp: Int) -> Double {
        guard ftp > 0, duration > 0 else { return 0 }
        var weighted = 0.0
        for segment in segments {
            guard let watts = segment.averageWatts(ftp: ftp) else { continue }
            weighted += pow(Double(watts), 4) * segment.duration
        }
        guard weighted > 0 else { return 0 }
        return pow(weighted / duration, 0.25) / Double(ftp)
    }

    /// Highest planned wattage, used to scale the profile chart.
    public func peakWatts(ftp: Int) -> Int {
        segments.compactMap { segment -> Int? in
            let a = segment.intensity.startTarget.resolvedWatts(ftp: ftp)
            let b = segment.intensity.endTarget.resolvedWatts(ftp: ftp)
            return [a, b].compactMap { $0 }.max()
        }
        .max() ?? ftp
    }

    /// Flattened drawing data for the profile chart: one entry per segment with
    /// absolute start time and the wattage at both ends.
    public func profile(ftp: Int) -> [ProfileBlock] {
        var start: TimeInterval = 0
        var blocks: [ProfileBlock] = []
        for segment in segments {
            blocks.append(
                ProfileBlock(
                    id: segment.id,
                    start: start,
                    duration: segment.duration,
                    startWatts: segment.intensity.startTarget.resolvedWatts(ftp: ftp),
                    endWatts: segment.intensity.endTarget.resolvedWatts(ftp: ftp),
                    zone: segment.zone(ftp: ftp)
                )
            )
            start += segment.duration
        }
        return blocks
    }

    public struct ProfileBlock: Identifiable, Hashable, Sendable {
        public let id: UUID
        public let start: TimeInterval
        public let duration: TimeInterval
        /// `nil` means a free-ride block - drawn as a hatched placeholder.
        public let startWatts: Int?
        public let endWatts: Int?
        public let zone: PowerZone?

        public var end: TimeInterval { start + duration }
    }

    /// A fresh, editable copy - used by "Duplizieren" and when editing a built-in.
    public func duplicated(named newName: String? = nil) -> Workout {
        Workout(
            id: UUID(),
            name: newName ?? "\(name) Kopie",
            summary: summary,
            tags: tags,
            segments: segments.map {
                var copy = $0
                copy.id = UUID()
                return copy
            },
            isBuiltIn: false,
            // Eine Kopie gehört dem, der sie macht, und ist erst einmal privat.
            visibility: .private,
            createdAt: Date(),
            updatedAt: Date()
        )
    }
}
