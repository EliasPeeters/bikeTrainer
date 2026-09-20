import Foundation

/// Decoded `Indoor Bike Data` (0x2AD2) notification.
///
/// The characteristic is a flags word followed by whatever fields the trainer
/// decided to include, in a fixed order. Fields are optional because no two
/// trainers send the same set.
public struct IndoorBikeData: Hashable, Sendable {
    public var instantaneousSpeed: Double?   // km/h
    public var averageSpeed: Double?         // km/h
    public var instantaneousCadence: Double? // rpm
    public var averageCadence: Double?       // rpm
    public var totalDistance: Double?        // m
    public var resistanceLevel: Int?
    public var instantaneousPower: Int?      // W
    public var averagePower: Int?            // W
    public var totalEnergy: Int?             // kcal
    public var heartRate: Int?               // bpm
    public var metabolicEquivalent: Double?
    public var elapsedTime: Int?             // s
    public var remainingTime: Int?           // s

    public init() {}

    /// Returns `nil` only when the payload is too short to even hold the flags.
    public init?(data: Data) {
        var reader = ByteReader(data)
        guard let flags = reader.uint16() else { return nil }
        self.init()

        func isSet(_ bit: Int) -> Bool { flags & (1 << UInt16(bit)) != 0 }

        // Bit 0 is "More Data": when it is *clear*, instantaneous speed is present.
        // That inversion trips up almost every first implementation.
        if !isSet(0), let raw = reader.uint16() {
            instantaneousSpeed = Double(raw) * 0.01
        }
        if isSet(1), let raw = reader.uint16() {
            averageSpeed = Double(raw) * 0.01
        }
        if isSet(2), let raw = reader.uint16() {
            instantaneousCadence = Double(raw) * 0.5
        }
        if isSet(3), let raw = reader.uint16() {
            averageCadence = Double(raw) * 0.5
        }
        if isSet(4), let raw = reader.uint24() {
            totalDistance = Double(raw)
        }
        if isSet(5), let raw = reader.int16() {
            resistanceLevel = Int(raw)
        }
        if isSet(6), let raw = reader.int16() {
            instantaneousPower = Int(raw)
        }
        if isSet(7), let raw = reader.int16() {
            averagePower = Int(raw)
        }
        if isSet(8) {
            if let total = reader.uint16() {
                // 0xFFFF is the spec's "not available" marker.
                totalEnergy = total == 0xFFFF ? nil : Int(total)
            }
            reader.skip(2) // energy per hour
            reader.skip(1) // energy per minute
        }
        if isSet(9), let raw = reader.uint8() {
            heartRate = Int(raw)
        }
        if isSet(10), let raw = reader.uint8() {
            metabolicEquivalent = Double(raw) * 0.1
        }
        if isSet(11), let raw = reader.uint16() {
            elapsedTime = Int(raw)
        }
        if isSet(12), let raw = reader.uint16() {
            remainingTime = Int(raw)
        }
    }
}
