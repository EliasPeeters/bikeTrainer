import Foundation
import WattwerkCore

/// Encoding and decoding for the Fitness Machine Control Point (0x2AD9).
public enum FitnessMachineControlPoint {
    public enum OpCode: UInt8, Sendable {
        case requestControl = 0x00
        case reset = 0x01
        case setTargetSpeed = 0x02
        case setTargetInclination = 0x03
        case setTargetResistanceLevel = 0x04
        case setTargetPower = 0x05
        case setTargetHeartRate = 0x06
        case startOrResume = 0x07
        case stopOrPause = 0x08
        case setIndoorBikeSimulation = 0x11
        case setWheelCircumference = 0x12
        case spinDownControl = 0x13
        case setTargetedCadence = 0x14
        case responseCode = 0x80
    }

    public enum ResultCode: UInt8, Sendable {
        case success = 0x01
        case opCodeNotSupported = 0x02
        case invalidParameter = 0x03
        case operationFailed = 0x04
        case controlNotPermitted = 0x05
    }

    public struct Response: Hashable, Sendable {
        public let requestOpCode: UInt8
        public let result: UInt8

        public var isSuccess: Bool { result == ResultCode.success.rawValue }

        public var error: TrainerControlError? {
            guard !isSuccess else { return nil }
            switch ResultCode(rawValue: result) {
            case .controlNotPermitted: return .controlNotPermitted
            case .opCodeNotSupported: return .notSupported
            case .invalidParameter, .operationFailed, .none: return .operationFailed(result)
            case .success: return nil
            }
        }
    }

    // MARK: Requests

    public static func requestControl() -> Data {
        Data([OpCode.requestControl.rawValue])
    }

    public static func reset() -> Data {
        Data([OpCode.reset.rawValue])
    }

    /// ERG mode: hold this wattage no matter the cadence.
    public static func setTargetPower(_ watts: Int) -> Data {
        let clamped = Int16(clamping: watts)
        let value = UInt16(bitPattern: clamped)
        return Data([
            OpCode.setTargetPower.rawValue,
            UInt8(value & 0xFF),
            UInt8((value >> 8) & 0xFF),
        ])
    }

    public static func start() -> Data {
        Data([OpCode.startOrResume.rawValue])
    }

    public static func pause() -> Data {
        Data([OpCode.stopOrPause.rawValue, 0x02])
    }

    public static func stop() -> Data {
        Data([OpCode.stopOrPause.rawValue, 0x01])
    }

    /// Simulation mode: the trainer computes resistance from a virtual gradient.
    /// Not used by the MVP, but this is the hook for a future "Strecke fahren" mode.
    public static func setSimulation(
        windSpeed: Double = 0,
        grade: Double,
        rollingResistance: Double = 0.004,
        windResistance: Double = 0.51
    ) -> Data {
        var data = Data([OpCode.setIndoorBikeSimulation.rawValue])
        let wind = Int16(clamping: Int((windSpeed * 1000).rounded()))
        let gradeRaw = Int16(clamping: Int((grade * 100).rounded()))
        let crr = UInt8(clamping: Int((rollingResistance * 10000).rounded()))
        let cw = UInt8(clamping: Int((windResistance * 100).rounded()))
        data.append(contentsOf: withUnsafeBytes(of: UInt16(bitPattern: wind).littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: UInt16(bitPattern: gradeRaw).littleEndian) { Array($0) })
        data.append(crr)
        data.append(cw)
        return data
    }

    // MARK: Responses

    public static func parseResponse(_ data: Data) -> Response? {
        var reader = ByteReader(data)
        guard let opCode = reader.uint8(), opCode == OpCode.responseCode.rawValue,
              let request = reader.uint8(),
              let result = reader.uint8()
        else { return nil }
        return Response(requestOpCode: request, result: result)
    }
}
