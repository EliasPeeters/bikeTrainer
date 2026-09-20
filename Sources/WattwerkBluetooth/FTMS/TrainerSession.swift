@preconcurrency import CoreBluetooth
import Foundation
import Observation
import WattwerkCore

/// A live connection to one trainer.
///
/// Owns the peripheral's characteristics, decodes Indoor Bike Data notifications
/// and implements `TrainerControl` on top of the Fitness Machine Control Point.
@MainActor
@Observable
public final class TrainerSession: NSObject, TrainerControl {
    public let peripheral: CBPeripheral
    public private(set) var feature: FitnessMachineFeature?
    public private(set) var powerRange: SupportedPowerRange?
    public private(set) var batteryLevel: Int?
    public private(set) var hasControl = false
    /// The last reading, also exposed for the device screen.
    public private(set) var lastReading: TrainerReading?

    /// Called on every notification. The app model forwards this into the engine.
    @ObservationIgnored public var onReading: ((TrainerReading) -> Void)?
    @ObservationIgnored public var onLog: ((String) -> Void)?

    @ObservationIgnored private var controlPoint: CBCharacteristic?
    @ObservationIgnored private var cadenceTracker = CadenceTracker()
    @ObservationIgnored private var pending: PendingRequest?

    private struct PendingRequest {
        let opCode: UInt8
        let continuation: CheckedContinuation<Void, Error>
        let timeout: Task<Void, Never>
    }

    public init(peripheral: CBPeripheral) {
        self.peripheral = peripheral
        super.init()
        peripheral.delegate = self
    }

    public var displayName: String {
        peripheral.name ?? "Trainer"
    }

    /// FTMS trainers that advertise power target setting can be driven in ERG mode.
    /// Everything else (power meters, CSC sensors) is read-only.
    public var supportsTargetPower: Bool {
        guard let feature else { return controlPoint != nil }
        return feature.supportsPowerTarget
    }

    public var supportedPowerRange: ClosedRange<Int>? {
        powerRange?.range
    }

    public func discover() {
        peripheral.discoverServices(
            GATT.trainerServices + [GATT.batteryService, GATT.heartRateService]
        )
    }

    // MARK: TrainerControl

    public func requestControl() async throws {
        guard controlPoint != nil else { throw TrainerControlError.notSupported }
        try await send(FitnessMachineControlPoint.requestControl(), opCode: 0x00)
        hasControl = true
        // Most trainers only accept targets once the machine is "started".
        // A few never implement it, so a failure here is not fatal.
        try? await send(FitnessMachineControlPoint.start(), opCode: 0x07)
    }

    public func setTargetPower(_ watts: Int) async throws {
        guard controlPoint != nil else { throw TrainerControlError.notSupported }
        if !hasControl {
            try await requestControl()
        }
        try await send(FitnessMachineControlPoint.setTargetPower(watts), opCode: 0x05)
    }

    public func releaseControl() async throws {
        guard controlPoint != nil, hasControl else { return }
        hasControl = false
        try? await send(FitnessMachineControlPoint.reset(), opCode: 0x01)
    }

    private func send(_ data: Data, opCode: UInt8, timeout: TimeInterval = 3) async throws {
        guard let controlPoint else { throw TrainerControlError.notSupported }
        guard peripheral.state == .connected else { throw TrainerControlError.notConnected }
        failPending(with: TrainerControlError.operationFailed(0))

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let timeoutTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(timeout))
                guard !Task.isCancelled else { return }
                self?.failPending(with: TrainerControlError.timedOut)
            }
            pending = PendingRequest(opCode: opCode, continuation: continuation, timeout: timeoutTask)
            peripheral.writeValue(data, for: controlPoint, type: .withResponse)
        }
    }

    private func resolvePending(_ response: FitnessMachineControlPoint.Response) {
        guard let request = pending else { return }
        pending = nil
        request.timeout.cancel()
        if let error = response.error {
            request.continuation.resume(throwing: error)
        } else {
            request.continuation.resume()
        }
    }

    private func failPending(with error: Error) {
        guard let request = pending else { return }
        pending = nil
        request.timeout.cancel()
        request.continuation.resume(throwing: error)
    }

    /// Called by the manager when the peripheral drops, so no request hangs forever.
    public func invalidate() {
        failPending(with: TrainerControlError.notConnected)
        hasControl = false
        controlPoint = nil
    }

    // MARK: Decoding

    private func handleIndoorBikeData(_ data: Data) {
        guard let parsed = IndoorBikeData(data: data) else { return }
        var reading = TrainerReading(
            power: parsed.instantaneousPower,
            cadence: parsed.instantaneousCadence.map { Int($0.rounded()) },
            speed: parsed.instantaneousSpeed,
            distance: parsed.totalDistance,
            heartRate: parsed.heartRate
        )
        if reading.power == nil, let average = parsed.averagePower {
            reading.power = average
        }
        lastReading = reading
        onReading?(reading)
    }

    private func handleCyclingPower(_ data: Data) {
        guard let parsed = CyclingPowerMeasurement(data: data) else { return }
        var cadence: Int?
        if let revolutions = parsed.cumulativeCrankRevolutions,
           let eventTime = parsed.lastCrankEventTime,
           let rpm = cadenceTracker.update(revolutions: revolutions, eventTime: eventTime) {
            cadence = Int(rpm.rounded())
        }
        let reading = TrainerReading(power: parsed.instantaneousPower, cadence: cadence)
        lastReading = reading
        onReading?(reading)
    }
}

// MARK: - CBPeripheralDelegate
//
// CoreBluetooth is configured with `queue: .main`, so every callback below
// already runs on the main thread - `assumeIsolated` documents that contract.
extension TrainerSession: CBPeripheralDelegate {
    public nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        MainActor.assumeIsolated {
            for service in peripheral.services ?? [] {
                switch service.uuid {
                case GATT.fitnessMachineService:
                    peripheral.discoverCharacteristics(
                        [
                            GATT.indoorBikeData,
                            GATT.fitnessMachineFeature,
                            GATT.fitnessMachineControlPoint,
                            GATT.fitnessMachineStatus,
                            GATT.supportedPowerRange,
                        ],
                        for: service
                    )
                case GATT.cyclingPowerService:
                    peripheral.discoverCharacteristics([GATT.cyclingPowerMeasurement], for: service)
                case GATT.batteryService:
                    peripheral.discoverCharacteristics([GATT.batteryLevel], for: service)
                default:
                    peripheral.discoverCharacteristics(nil, for: service)
                }
            }
        }
    }

    public nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            for characteristic in service.characteristics ?? [] {
                switch characteristic.uuid {
                case GATT.indoorBikeData:
                    peripheral.setNotifyValue(true, for: characteristic)
                case GATT.cyclingPowerMeasurement:
                    // Only useful when the trainer has no FTMS data stream.
                    peripheral.setNotifyValue(true, for: characteristic)
                case GATT.fitnessMachineControlPoint:
                    controlPoint = characteristic
                    peripheral.setNotifyValue(true, for: characteristic)
                case GATT.fitnessMachineStatus:
                    peripheral.setNotifyValue(true, for: characteristic)
                case GATT.fitnessMachineFeature, GATT.supportedPowerRange, GATT.batteryLevel:
                    peripheral.readValue(for: characteristic)
                default:
                    break
                }
            }
        }
    }

    public nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            guard let data = characteristic.value else { return }
            switch characteristic.uuid {
            case GATT.indoorBikeData:
                handleIndoorBikeData(data)
            case GATT.cyclingPowerMeasurement:
                handleCyclingPower(data)
            case GATT.fitnessMachineFeature:
                feature = FitnessMachineFeature(data: data)
            case GATT.supportedPowerRange:
                powerRange = SupportedPowerRange(data: data)
            case GATT.batteryLevel:
                batteryLevel = data.first.map(Int.init)
            case GATT.fitnessMachineControlPoint:
                if let response = FitnessMachineControlPoint.parseResponse(data) {
                    resolvePending(response)
                }
            case GATT.fitnessMachineStatus:
                onLog?("Status: \(data.map { String(format: "%02X", $0) }.joined(separator: " "))")
            default:
                break
            }
        }
    }

    public nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard let error else { return }
        MainActor.assumeIsolated {
            failPending(with: error)
        }
    }
}
