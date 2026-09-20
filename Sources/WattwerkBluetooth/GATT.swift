import CoreBluetooth

/// The Bluetooth SIG assigned numbers this app cares about.
///
/// Everything here is standard: any trainer that speaks FTMS works, no vendor
/// specific protocol needed. Trainers that only speak a proprietary protocol
/// (older Wahoo/Tacx firmware) are out of scope.
public enum GATT {
    // `CBUUID` is not marked `Sendable` even though instances are immutable once
    // created, so the constants below are declared `nonisolated(unsafe)` rather
    // than paying for a fresh allocation on every comparison.

    /// Fitness Machine Service - power, cadence, speed and, crucially, ERG control.
    public nonisolated(unsafe) static let fitnessMachineService = CBUUID(string: "1826")
    public nonisolated(unsafe) static let indoorBikeData = CBUUID(string: "2AD2")
    public nonisolated(unsafe) static let fitnessMachineFeature = CBUUID(string: "2ACC")
    public nonisolated(unsafe) static let fitnessMachineControlPoint = CBUUID(string: "2AD9")
    public nonisolated(unsafe) static let fitnessMachineStatus = CBUUID(string: "2ADA")
    public nonisolated(unsafe) static let supportedPowerRange = CBUUID(string: "2AD8")

    /// Heart Rate Service - chest straps and armbands.
    public nonisolated(unsafe) static let heartRateService = CBUUID(string: "180D")
    public nonisolated(unsafe) static let heartRateMeasurement = CBUUID(string: "2A37")
    public nonisolated(unsafe) static let bodySensorLocation = CBUUID(string: "2A38")

    /// Cycling Power Service - read-only fallback for trainers and power meters
    /// that do not expose FTMS.
    public nonisolated(unsafe) static let cyclingPowerService = CBUUID(string: "1818")
    public nonisolated(unsafe) static let cyclingPowerMeasurement = CBUUID(string: "2A63")
    public nonisolated(unsafe) static let cyclingPowerFeature = CBUUID(string: "2A65")

    /// Cycling Speed and Cadence - cadence-only sensors.
    public nonisolated(unsafe) static let cyclingSpeedCadenceService = CBUUID(string: "1816")
    public nonisolated(unsafe) static let cscMeasurement = CBUUID(string: "2A5B")

    public nonisolated(unsafe) static let deviceInformationService = CBUUID(string: "180A")
    public nonisolated(unsafe) static let batteryService = CBUUID(string: "180F")
    public nonisolated(unsafe) static let batteryLevel = CBUUID(string: "2A19")

    /// Everything we scan for when looking for a bike.
    public nonisolated(unsafe) static let trainerServices: [CBUUID] = [
        fitnessMachineService,
        cyclingPowerService,
        cyclingSpeedCadenceService,
    ]

    public nonisolated(unsafe) static let heartRateServices: [CBUUID] = [heartRateService]

    public nonisolated(unsafe) static let allScanServices: [CBUUID] = trainerServices + heartRateServices

    // Short-form identifiers, for comparing advertisement payloads without
    // carrying non-`Sendable` `CBUUID` objects across isolation boundaries.
    public static let fitnessMachineServiceID = "1826"
    public static let heartRateServiceID = "180D"
    public static let trainerServiceIDs: Set<String> = ["1826", "1818", "1816"]
}

/// Little-endian reader for GATT payloads. Every read is bounds checked - a
/// malformed packet from a cheap sensor must not take the app down mid-interval.
struct ByteReader {
    private let bytes: [UInt8]
    private(set) var offset: Int = 0

    init(_ data: Data) {
        bytes = [UInt8](data)
    }

    var remaining: Int { max(0, bytes.count - offset) }

    mutating func uint8() -> UInt8? {
        guard remaining >= 1 else { return nil }
        defer { offset += 1 }
        return bytes[offset]
    }

    mutating func uint16() -> UInt16? {
        guard remaining >= 2 else { return nil }
        defer { offset += 2 }
        return UInt16(bytes[offset]) | (UInt16(bytes[offset + 1]) << 8)
    }

    mutating func int16() -> Int16? {
        guard let value = uint16() else { return nil }
        return Int16(bitPattern: value)
    }

    mutating func uint24() -> UInt32? {
        guard remaining >= 3 else { return nil }
        defer { offset += 3 }
        return UInt32(bytes[offset])
            | (UInt32(bytes[offset + 1]) << 8)
            | (UInt32(bytes[offset + 2]) << 16)
    }

    mutating func uint32() -> UInt32? {
        guard remaining >= 4 else { return nil }
        defer { offset += 4 }
        return UInt32(bytes[offset])
            | (UInt32(bytes[offset + 1]) << 8)
            | (UInt32(bytes[offset + 2]) << 16)
            | (UInt32(bytes[offset + 3]) << 24)
    }

    /// Advances without interpreting - used to step over fields we do not need.
    mutating func skip(_ count: Int) {
        offset = min(bytes.count, offset + count)
    }
}
