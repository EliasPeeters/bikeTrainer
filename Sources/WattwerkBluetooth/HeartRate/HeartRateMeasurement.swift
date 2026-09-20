import Foundation

/// Decoded `Heart Rate Measurement` (0x2A37).
public struct HeartRateMeasurement: Hashable, Sendable {
    public var beatsPerMinute: Int
    public var sensorContact: SensorContact
    public var energyExpended: Int?
    /// Beat-to-beat intervals in seconds - the raw material for HRV, kept for later.
    public var rrIntervals: [Double]

    public enum SensorContact: Hashable, Sendable {
        case notSupported
        case notDetected
        case detected
    }

    public init?(data: Data) {
        var reader = ByteReader(data)
        guard let flags = reader.uint8() else { return nil }

        let isWideFormat = flags & 0x01 != 0
        if isWideFormat {
            guard let value = reader.uint16() else { return nil }
            beatsPerMinute = Int(value)
        } else {
            guard let value = reader.uint8() else { return nil }
            beatsPerMinute = Int(value)
        }

        switch (flags >> 1) & 0x03 {
        case 0b10: sensorContact = .notDetected
        case 0b11: sensorContact = .detected
        default: sensorContact = .notSupported
        }

        if flags & 0x08 != 0, let energy = reader.uint16() {
            energyExpended = Int(energy)
        } else {
            energyExpended = nil
        }

        var intervals: [Double] = []
        if flags & 0x10 != 0 {
            // RR values come in 1/1024 second units, as many as fit in the packet.
            while let raw = reader.uint16() {
                intervals.append(Double(raw) / 1024.0)
            }
        }
        rrIntervals = intervals
    }
}
