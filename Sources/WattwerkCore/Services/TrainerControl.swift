import Foundation

/// A reading straight off the trainer. Everything is optional because
/// trainers differ wildly in what they report.
public struct TrainerReading: Hashable, Sendable {
    public var power: Int?
    public var cadence: Int?
    public var speed: Double?
    public var distance: Double?
    public var heartRate: Int?
    public var timestamp: Date

    public init(
        power: Int? = nil,
        cadence: Int? = nil,
        speed: Double? = nil,
        distance: Double? = nil,
        heartRate: Int? = nil,
        timestamp: Date = Date()
    ) {
        self.power = power
        self.cadence = cadence
        self.speed = speed
        self.distance = distance
        self.heartRate = heartRate
        self.timestamp = timestamp
    }
}

/// The port the ride engine uses to push ERG targets at a trainer.
///
/// `WattwerkBluetooth` implements this for FTMS hardware; the simulator
/// implements it for development without a bike in the room.
@MainActor
public protocol TrainerControl: AnyObject {
    var displayName: String { get }
    /// `false` for dumb trainers and pure power meters - the app then shows the
    /// target as a number to chase instead of commanding it.
    var supportsTargetPower: Bool { get }
    /// Reported by FTMS as the supported power range, if the trainer advertises one.
    var supportedPowerRange: ClosedRange<Int>? { get }

    /// Ask the trainer for control. FTMS requires this before any target is accepted.
    func requestControl() async throws
    func setTargetPower(_ watts: Int) async throws
    /// Hand control back so the trainer returns to its own resistance mode.
    func releaseControl() async throws
}

public enum TrainerControlError: Error, Sendable, LocalizedError {
    case notConnected
    case controlNotPermitted
    case notSupported
    case operationFailed(UInt8)
    case timedOut

    public var errorDescription: String? {
        switch self {
        case .notConnected: return "Trainer nicht verbunden."
        case .controlNotPermitted: return "Der Trainer hat die Steuerung abgelehnt."
        case .notSupported: return "Der Trainer unterstützt diese Funktion nicht."
        case let .operationFailed(code): return "Der Trainer meldet Fehler \(code)."
        case .timedOut: return "Der Trainer antwortet nicht."
        }
    }
}
