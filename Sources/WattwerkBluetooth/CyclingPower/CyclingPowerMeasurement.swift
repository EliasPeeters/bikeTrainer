import Foundation

/// Decoded `Cycling Power Measurement` (0x2A63).
///
/// Used as a fallback for trainers and power meters without FTMS. Cadence is not
/// transmitted directly - it has to be derived from crank revolution counters,
/// which is what `CadenceTracker` does.
public struct CyclingPowerMeasurement: Hashable, Sendable {
    public var instantaneousPower: Int
    public var pedalPowerBalance: Double?
    public var cumulativeCrankRevolutions: Int?
    /// Crank event timestamp in 1/1024 s, wraps at 64 seconds.
    public var lastCrankEventTime: Int?
    public var cumulativeWheelRevolutions: Int?
    public var lastWheelEventTime: Int?

    public init?(data: Data) {
        var reader = ByteReader(data)
        guard let flags = reader.uint16(), let power = reader.int16() else { return nil }
        instantaneousPower = Int(power)

        func isSet(_ bit: Int) -> Bool { flags & (1 << UInt16(bit)) != 0 }

        if isSet(0), let balance = reader.uint8() {
            pedalPowerBalance = Double(balance) * 0.5
        }
        if isSet(2) {
            reader.skip(2) // accumulated torque
        }
        if isSet(4) {
            cumulativeWheelRevolutions = reader.uint32().map(Int.init)
            lastWheelEventTime = reader.uint16().map(Int.init)
        }
        if isSet(5) {
            cumulativeCrankRevolutions = reader.uint16().map(Int.init)
            lastCrankEventTime = reader.uint16().map(Int.init)
        }
    }
}

/// Turns cumulative crank counters into an rpm value.
///
/// Both counters wrap (revolutions at 65536, event time at 64 seconds), so every
/// difference has to be taken modulo its field width.
public struct CadenceTracker: Sendable {
    private var lastRevolutions: Int?
    private var lastEventTime: Int?

    public init() {}

    public mutating func update(revolutions: Int, eventTime: Int) -> Double? {
        defer {
            lastRevolutions = revolutions
            lastEventTime = eventTime
        }
        guard let previousRevolutions = lastRevolutions, let previousTime = lastEventTime else {
            return nil
        }

        let revolutionDelta = (revolutions - previousRevolutions + 0x10000) % 0x10000
        let timeDelta = (eventTime - previousTime + 0x10000) % 0x10000

        guard timeDelta > 0 else {
            // No new crank event since the last packet. No revolutions either means
            // the rider is coasting; anything else is a packet we cannot interpret.
            return revolutionDelta == 0 ? 0 : nil
        }

        let seconds = Double(timeDelta) / 1024.0
        let cadence = Double(revolutionDelta) / seconds * 60.0
        guard cadence.isFinite, cadence < 250 else { return nil }
        return cadence
    }
}
