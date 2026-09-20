@preconcurrency import CoreBluetooth
import Foundation
import Observation
import WattwerkCore

/// Owns the single `CBCentralManager` and the two connections the app cares
/// about: one trainer, one heart rate strap.
///
/// The manager is created with `queue: .main`, so every CoreBluetooth callback
/// lands on the main actor and the UI can read this object directly.
@MainActor
@Observable
public final class BluetoothManager: NSObject {
    public private(set) var authorizationState: CBManagerState = .unknown
    public private(set) var isScanning = false
    public private(set) var discoveredDevices: [DiscoveredDevice] = []

    public private(set) var trainerState: ConnectionState = .disconnected
    public private(set) var heartRateState: ConnectionState = .disconnected
    public private(set) var trainer: TrainerSession?
    public private(set) var heartRateMonitor: HeartRateSession?

    /// Forwarded into the ride engine by the app model.
    @ObservationIgnored public var onTrainerReading: ((TrainerReading) -> Void)?
    @ObservationIgnored public var onHeartRate: ((Int) -> Void)?
    /// Fires whenever the trainer connects or drops, so the engine can rebind.
    @ObservationIgnored public var onTrainerChanged: ((TrainerSession?) -> Void)?

    /// Peripherals to reconnect to on launch, from settings.
    @ObservationIgnored public var autoConnectTrainerID: UUID?
    @ObservationIgnored public var autoConnectHeartRateID: UUID?

    @ObservationIgnored private var central: CBCentralManager!
    @ObservationIgnored private var pendingTrainer: CBPeripheral?
    @ObservationIgnored private var pendingHeartRate: CBPeripheral?
    @ObservationIgnored private var includeUnnamedDevices = false
    @ObservationIgnored private var pruneTask: Task<Void, Never>?

    public override init() {
        super.init()
        central = CBCentralManager(
            delegate: self,
            queue: .main,
            options: [CBCentralManagerOptionShowPowerAlertKey: true]
        )
    }

    public var isPoweredOn: Bool { authorizationState == .poweredOn }

    /// A human readable reason why scanning is not possible right now.
    public var unavailableReason: String? {
        switch authorizationState {
        case .poweredOn: return nil
        case .poweredOff: return "Bluetooth ist ausgeschaltet."
        case .unauthorized: return "Wattwerk darf Bluetooth nicht verwenden. Bitte in den Systemeinstellungen freigeben."
        case .unsupported: return "Dieses Gerät unterstützt kein Bluetooth Low Energy."
        case .resetting: return "Bluetooth startet neu …"
        case .unknown: return "Bluetooth wird initialisiert …"
        @unknown default: return nil
        }
    }

    // MARK: Scanning

    public func startScan(includeUnnamedDevices: Bool = false) {
        self.includeUnnamedDevices = includeUnnamedDevices
        guard isPoweredOn else { return }
        discoveredDevices.removeAll()
        // A nil service filter finds sensors with unusual advertisements, at the
        // cost of listing every Bluetooth device in the flat.
        let services: [CBUUID]? = includeUnnamedDevices ? nil : GATT.allScanServices
        central.scanForPeripherals(
            withServices: services,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        isScanning = true
        startPruning()
    }

    public func stopScan() {
        guard isScanning else { return }
        central.stopScan()
        isScanning = false
        pruneTask?.cancel()
        pruneTask = nil
    }

    /// Drops devices that stopped advertising, so the list does not fill up with ghosts.
    private func startPruning() {
        pruneTask?.cancel()
        pruneTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard let self, !Task.isCancelled else { return }
                let cutoff = Date().addingTimeInterval(-15)
                self.discoveredDevices.removeAll { device in
                    device.lastSeen < cutoff
                        && device.id != self.trainer?.peripheral.identifier
                        && device.id != self.heartRateMonitor?.peripheral.identifier
                }
            }
        }
    }

    // MARK: Connecting

    public func connect(_ device: DiscoveredDevice, as kind: DiscoveredDevice.Kind) {
        guard let peripheral = central.retrievePeripherals(withIdentifiers: [device.id]).first else {
            return
        }
        connect(peripheral, as: kind)
    }

    private func connect(_ peripheral: CBPeripheral, as kind: DiscoveredDevice.Kind) {
        switch kind {
        case .trainer:
            pendingTrainer = peripheral
            trainerState = .connecting
        case .heartRate:
            pendingHeartRate = peripheral
            heartRateState = .connecting
        }
        central.connect(peripheral)
    }

    public func disconnectTrainer() {
        if let peripheral = trainer?.peripheral {
            trainer?.invalidate()
            central.cancelPeripheralConnection(peripheral)
        }
        trainer = nil
        trainerState = .disconnected
    }

    public func disconnectHeartRateMonitor() {
        if let peripheral = heartRateMonitor?.peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        heartRateMonitor = nil
        heartRateState = .disconnected
    }

    /// Reconnects to the devices used last time, without showing a picker.
    public func reconnectKnownDevices() {
        guard isPoweredOn else { return }
        var identifiers: [UUID] = []
        if let autoConnectTrainerID, trainer == nil { identifiers.append(autoConnectTrainerID) }
        if let autoConnectHeartRateID, heartRateMonitor == nil { identifiers.append(autoConnectHeartRateID) }
        guard !identifiers.isEmpty else { return }
        for peripheral in central.retrievePeripherals(withIdentifiers: identifiers) {
            if peripheral.identifier == autoConnectTrainerID {
                connect(peripheral, as: .trainer)
            } else if peripheral.identifier == autoConnectHeartRateID {
                connect(peripheral, as: .heartRate)
            }
        }
    }

    private func upsert(_ device: DiscoveredDevice) {
        if let index = discoveredDevices.firstIndex(where: { $0.id == device.id }) {
            var existing = discoveredDevices[index]
            existing.rssi = device.rssi
            existing.lastSeen = device.lastSeen
            existing.kinds.formUnion(device.kinds)
            existing.advertisesFTMS = existing.advertisesFTMS || device.advertisesFTMS
            if existing.name.isEmpty { existing.name = device.name }
            discoveredDevices[index] = existing
        } else {
            discoveredDevices.append(device)
            discoveredDevices.sort { $0.rssi > $1.rssi }
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension BluetoothManager: CBCentralManagerDelegate {
    public nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated {
            authorizationState = central.state
            if central.state == .poweredOn {
                reconnectKnownDevices()
            } else {
                isScanning = false
                trainerState = .disconnected
                heartRateState = .disconnected
                trainer = nil
                heartRateMonitor = nil
            }
        }
    }

    public nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertisedServices = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? [])
            .map(\.uuidString)
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let identifier = peripheral.identifier
        let peripheralName = peripheral.name
        let rssi = RSSI.intValue

        MainActor.assumeIsolated {
            var kinds: Set<DiscoveredDevice.Kind> = []
            if advertisedServices.contains(GATT.heartRateServiceID) { kinds.insert(.heartRate) }
            if advertisedServices.contains(where: { GATT.trainerServiceIDs.contains($0) }) {
                kinds.insert(.trainer)
            }
            let name = advertisedName ?? peripheralName ?? ""
            if kinds.isEmpty {
                guard includeUnnamedDevices, !name.isEmpty else { return }
                // Unfiltered scan: we cannot tell what it is until we connect.
                kinds = [.trainer]
            }
            upsert(
                DiscoveredDevice(
                    id: identifier,
                    name: name.isEmpty ? "Unbekanntes Gerät" : name,
                    kinds: kinds,
                    rssi: rssi,
                    advertisesFTMS: advertisedServices.contains(GATT.fitnessMachineServiceID)
                )
            )
        }
    }

    public nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        MainActor.assumeIsolated {
            if peripheral.identifier == pendingTrainer?.identifier {
                pendingTrainer = nil
                let session = TrainerSession(peripheral: peripheral)
                session.onReading = { [weak self] reading in
                    self?.onTrainerReading?(reading)
                }
                trainer = session
                trainerState = .connected
                autoConnectTrainerID = peripheral.identifier
                session.discover()
                onTrainerChanged?(session)
            } else if peripheral.identifier == pendingHeartRate?.identifier {
                pendingHeartRate = nil
                let session = HeartRateSession(peripheral: peripheral)
                session.onHeartRate = { [weak self] bpm in
                    self?.onHeartRate?(bpm)
                }
                heartRateMonitor = session
                heartRateState = .connected
                autoConnectHeartRateID = peripheral.identifier
                session.discover()
            }
        }
    }

    public nonisolated func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        let message = error?.localizedDescription ?? "Verbindung fehlgeschlagen."
        MainActor.assumeIsolated {
            if peripheral.identifier == pendingTrainer?.identifier {
                pendingTrainer = nil
                trainerState = .failed(message)
            }
            if peripheral.identifier == pendingHeartRate?.identifier {
                pendingHeartRate = nil
                heartRateState = .failed(message)
            }
        }
    }

    public nonisolated func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        let message = error?.localizedDescription
        MainActor.assumeIsolated {
            if peripheral.identifier == trainer?.peripheral.identifier {
                trainer?.invalidate()
                trainer = nil
                trainerState = message.map { .failed($0) } ?? .disconnected
                onTrainerChanged?(nil)
                // A trainer that drops mid-interval should come back by itself.
                if error != nil { connect(peripheral, as: .trainer) }
            }
            if peripheral.identifier == heartRateMonitor?.peripheral.identifier {
                heartRateMonitor = nil
                heartRateState = message.map { .failed($0) } ?? .disconnected
                if error != nil { connect(peripheral, as: .heartRate) }
            }
        }
    }
}
