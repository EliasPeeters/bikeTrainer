import Foundation

/// What a peripheral looks like in the "Geräte" list before it is connected.
public struct DiscoveredDevice: Identifiable, Hashable, Sendable {
    public enum Kind: String, Hashable, Sendable, CaseIterable {
        case trainer
        case heartRate

        public var localizedName: String {
            switch self {
            case .trainer: return "Trainer"
            case .heartRate: return "Pulsgurt"
            }
        }
    }

    public let id: UUID
    public var name: String
    /// A trainer that also relays heart rate shows up under both kinds.
    public var kinds: Set<Kind>
    public var rssi: Int
    /// `true` when the trainer advertises the Fitness Machine Service, i.e. ERG
    /// control is likely to work.
    public var advertisesFTMS: Bool
    public var lastSeen: Date

    public init(
        id: UUID,
        name: String,
        kinds: Set<Kind>,
        rssi: Int,
        advertisesFTMS: Bool,
        lastSeen: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.kinds = kinds
        self.rssi = rssi
        self.advertisesFTMS = advertisesFTMS
        self.lastSeen = lastSeen
    }

    /// Rough signal bars, 0...3.
    public var signalBars: Int {
        switch rssi {
        case (-55)...: return 3
        case (-70)..<(-55): return 2
        case (-85)..<(-70): return 1
        default: return 0
        }
    }
}

public enum ConnectionState: Hashable, Sendable {
    case disconnected
    case connecting
    case connected
    case failed(String)

    public var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }

    public var localizedDescription: String {
        switch self {
        case .disconnected: return "Nicht verbunden"
        case .connecting: return "Verbinde …"
        case .connected: return "Verbunden"
        case let .failed(message): return message
        }
    }
}
