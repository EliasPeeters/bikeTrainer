import Foundation

/// Decoded `Fitness Machine Feature` (0x2ACC): two 32 bit flag words telling us
/// what the trainer measures and what it lets us set.
public struct FitnessMachineFeature: Hashable, Sendable {
    public let machineFeatures: UInt32
    public let targetSettingFeatures: UInt32

    public init(machineFeatures: UInt32, targetSettingFeatures: UInt32) {
        self.machineFeatures = machineFeatures
        self.targetSettingFeatures = targetSettingFeatures
    }

    public init?(data: Data) {
        var reader = ByteReader(data)
        guard let machine = reader.uint32(), let target = reader.uint32() else { return nil }
        self.init(machineFeatures: machine, targetSettingFeatures: target)
    }

    private func machineBit(_ bit: Int) -> Bool { machineFeatures & (1 << UInt32(bit)) != 0 }
    private func targetBit(_ bit: Int) -> Bool { targetSettingFeatures & (1 << UInt32(bit)) != 0 }

    public var supportsCadence: Bool { machineBit(1) }
    public var supportsTotalDistance: Bool { machineBit(2) }
    public var supportsResistanceLevel: Bool { machineBit(7) }
    public var supportsHeartRateMeasurement: Bool { machineBit(10) }
    public var supportsPowerMeasurement: Bool { machineBit(14) }

    /// The one that decides whether ERG mode is possible at all.
    public var supportsPowerTarget: Bool { targetBit(3) }
    public var supportsResistanceTarget: Bool { targetBit(2) }
    public var supportsSimulation: Bool { targetBit(13) }
    public var supportsSpinDown: Bool { targetBit(15) }
}

/// Decoded `Supported Power Range` (0x2AD8).
public struct SupportedPowerRange: Hashable, Sendable {
    public let minimum: Int
    public let maximum: Int
    public let increment: Int

    public init(minimum: Int, maximum: Int, increment: Int) {
        self.minimum = minimum
        self.maximum = maximum
        self.increment = increment
    }

    public init?(data: Data) {
        var reader = ByteReader(data)
        guard let min = reader.int16(), let max = reader.int16(), let step = reader.uint16() else {
            return nil
        }
        self.init(minimum: Int(min), maximum: Int(max), increment: Int(step))
    }

    public var range: ClosedRange<Int> {
        let low = max(0, minimum)
        let high = max(low, maximum)
        return low...high
    }
}
