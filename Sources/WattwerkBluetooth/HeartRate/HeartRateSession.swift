@preconcurrency import CoreBluetooth
import Foundation
import Observation

/// A live connection to a heart rate strap.
@MainActor
@Observable
public final class HeartRateSession: NSObject {
    public let peripheral: CBPeripheral
    public private(set) var heartRate: Int?
    public private(set) var batteryLevel: Int?
    public private(set) var hasSensorContact: Bool?

    @ObservationIgnored public var onHeartRate: ((Int) -> Void)?

    public init(peripheral: CBPeripheral) {
        self.peripheral = peripheral
        super.init()
        peripheral.delegate = self
    }

    public var displayName: String {
        peripheral.name ?? "Pulsgurt"
    }

    public func discover() {
        peripheral.discoverServices([GATT.heartRateService, GATT.batteryService])
    }
}

extension HeartRateSession: CBPeripheralDelegate {
    public nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        MainActor.assumeIsolated {
            for service in peripheral.services ?? [] {
                switch service.uuid {
                case GATT.heartRateService:
                    peripheral.discoverCharacteristics([GATT.heartRateMeasurement], for: service)
                case GATT.batteryService:
                    peripheral.discoverCharacteristics([GATT.batteryLevel], for: service)
                default:
                    break
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
                case GATT.heartRateMeasurement:
                    peripheral.setNotifyValue(true, for: characteristic)
                case GATT.batteryLevel:
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
            case GATT.heartRateMeasurement:
                guard let measurement = HeartRateMeasurement(data: data) else { return }
                heartRate = measurement.beatsPerMinute
                switch measurement.sensorContact {
                case .detected: hasSensorContact = true
                case .notDetected: hasSensorContact = false
                case .notSupported: hasSensorContact = nil
                }
                onHeartRate?(measurement.beatsPerMinute)
            case GATT.batteryLevel:
                batteryLevel = data.first.map(Int.init)
            default:
                break
            }
        }
    }
}
