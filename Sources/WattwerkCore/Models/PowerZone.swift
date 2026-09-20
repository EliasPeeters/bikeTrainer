import Foundation

/// Classic seven-zone model (Coggan). Used for colour coding and time-in-zone stats.
public enum PowerZone: Int, CaseIterable, Sendable, Codable, Identifiable {
    case recovery = 1      // < 56 % FTP
    case endurance = 2     // 56 - 75 %
    case tempo = 3         // 76 - 90 %
    case threshold = 4     // 91 - 105 %
    case vo2max = 5        // 106 - 120 %
    case anaerobic = 6     // 121 - 150 %
    case neuromuscular = 7 // > 150 %

    public var id: Int { rawValue }

    public init(fractionOfFTP fraction: Double) {
        switch fraction {
        case ..<0.56: self = .recovery
        case ..<0.76: self = .endurance
        case ..<0.91: self = .tempo
        case ..<1.06: self = .threshold
        case ..<1.21: self = .vo2max
        case ..<1.51: self = .anaerobic
        default: self = .neuromuscular
        }
    }

    public init(watts: Int, ftp: Int) {
        guard ftp > 0 else { self = .endurance; return }
        self.init(fractionOfFTP: Double(watts) / Double(ftp))
    }

    public var shortName: String {
        "Z\(rawValue)"
    }

    /// German UI label - the app speaks German, the code speaks English.
    public var localizedName: String {
        switch self {
        case .recovery: return "Erholung"
        case .endurance: return "Grundlage"
        case .tempo: return "Tempo"
        case .threshold: return "Schwelle"
        case .vo2max: return "VO2max"
        case .anaerobic: return "Anaerob"
        case .neuromuscular: return "Sprint"
        }
    }

    /// Upper bound of the zone as a fraction of FTP (`nil` for the open-ended top zone).
    public var upperBound: Double? {
        switch self {
        case .recovery: return 0.56
        case .endurance: return 0.76
        case .tempo: return 0.91
        case .threshold: return 1.06
        case .vo2max: return 1.21
        case .anaerobic: return 1.51
        case .neuromuscular: return nil
        }
    }
}
