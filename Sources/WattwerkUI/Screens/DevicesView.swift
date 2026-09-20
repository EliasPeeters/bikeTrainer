import SwiftUI
import WattwerkBluetooth
import WattwerkCore

/// Find, connect and check sensors.
struct DevicesView: View {
    let model: AppModel

    private var bluetooth: BluetoothManager { model.bluetooth }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let reason = bluetooth.unavailableReason {
                    Label(reason, systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 14 * Theme.scale))
                        .foregroundStyle(Theme.accent)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardBackground(Theme.surfaceRaised)
                }

                connectedSection
                scanSection
                simulatorSection
            }
            .padding(24)
        }
        .background(Theme.background)
        .sectionTitle("Geräte")
        .onAppear { bluetooth.reconnectKnownDevices() }
        .onDisappear { bluetooth.stopScan() }
    }

    private var connectedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Verbunden")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))

            if let trainer = bluetooth.trainer {
                ConnectedDeviceRow(
                    title: trainer.displayName,
                    subtitle: trainerSubtitle(trainer),
                    systemImage: "bicycle",
                    battery: trainer.batteryLevel
                ) {
                    bluetooth.disconnectTrainer()
                    model.settings.settings.lastTrainerID = nil
                }
            }

            if let monitor = bluetooth.heartRateMonitor {
                ConnectedDeviceRow(
                    title: monitor.displayName,
                    subtitle: monitor.heartRate.map { "\($0) bpm" } ?? "Wartet auf Signal",
                    systemImage: "heart.fill",
                    battery: monitor.batteryLevel
                ) {
                    bluetooth.disconnectHeartRateMonitor()
                    model.settings.settings.lastHeartRateID = nil
                }
            }

            if bluetooth.trainer == nil && bluetooth.heartRateMonitor == nil {
                Text("Noch nichts verbunden.")
                    .font(.system(size: 14 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private func trainerSubtitle(_ trainer: TrainerSession) -> String {
        var parts: [String] = []
        parts.append(trainer.supportsTargetPower ? "ERG-Steuerung" : "Nur Messung")
        if let range = trainer.supportedPowerRange {
            parts.append("\(range.lowerBound)–\(range.upperBound) W")
        }
        if let power = trainer.lastReading?.power {
            parts.append("\(power) W")
        }
        return parts.joined(separator: " · ")
    }

    private var scanSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("In Reichweite")
                    .font(.system(size: 18 * Theme.scale, weight: .semibold))
                Spacer()
                Button {
                    if bluetooth.isScanning {
                        bluetooth.stopScan()
                    } else {
                        bluetooth.startScan()
                    }
                } label: {
                    Label(
                        bluetooth.isScanning ? "Suche läuft" : "Suchen",
                        systemImage: bluetooth.isScanning ? "stop.circle" : "magnifyingglass"
                    )
                }
                .buttonStyle(.borderedProminent)
                .disabled(!bluetooth.isPoweredOn)
            }

            if bluetooth.discoveredDevices.isEmpty {
                Text(
                    bluetooth.isScanning
                        ? "Suche nach Trainern und Pulsgurten … Trainer aufwecken, indem du kurz trittst."
                        : "Starte die Suche, um Geräte zu finden."
                )
                .font(.system(size: 14 * Theme.scale))
                .foregroundStyle(.secondary)
            }

            ForEach(bluetooth.discoveredDevices) { device in
                DiscoveredDeviceRow(device: device) { kind in
                    bluetooth.connect(device, as: kind)
                    switch kind {
                    case .trainer: model.settings.settings.lastTrainerID = device.id
                    case .heartRate: model.settings.settings.lastHeartRateID = device.id
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private var simulatorSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(
                get: { model.settings.settings.simulatorEnabled },
                set: { model.setSimulatorEnabled($0) }
            )) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Simulator")
                        .font(.system(size: 16 * Theme.scale, weight: .semibold))
                    Text("Erzeugt realistische Leistungs-, Trittfrequenz- und Pulswerte. Zum Ausprobieren ohne Rad.")
                        .font(.system(size: 13 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}

struct ConnectedDeviceRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let battery: Int?
    let onDisconnect: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 20 * Theme.scale))
                .foregroundStyle(Theme.positive)
                .frame(width: 34 * Theme.scale)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16 * Theme.scale, weight: .medium))
                Text(subtitle)
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let battery {
                Label("\(battery) %", systemImage: "battery.100")
                    .font(.system(size: 12 * Theme.scale))
                    .foregroundStyle(.secondary)
            }

            Button("Trennen", action: onDisconnect)
                .buttonStyle(.bordered)
        }
        .padding(.vertical, 6)
    }
}

struct DiscoveredDeviceRow: View {
    let device: DiscoveredDevice
    let onConnect: (DiscoveredDevice.Kind) -> Void

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: device.kinds.contains(.heartRate) && !device.kinds.contains(.trainer)
                ? "heart.fill"
                : "bicycle")
                .font(.system(size: 18 * Theme.scale))
                .foregroundStyle(.secondary)
                .frame(width: 34 * Theme.scale)

            VStack(alignment: .leading, spacing: 2) {
                Text(device.name)
                    .font(.system(size: 16 * Theme.scale, weight: .medium))
                HStack(spacing: 6) {
                    if device.advertisesFTMS {
                        Text("FTMS")
                            .font(.system(size: 11 * Theme.scale, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Theme.positive.opacity(0.25)))
                    }
                    Text("\(device.rssi) dBm")
                        .font(.system(size: 12 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            ForEach(Array(device.kinds).sorted(by: { $0.rawValue < $1.rawValue }), id: \.self) { kind in
                Button("Als \(kind.localizedName)") { onConnect(kind) }
                    .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 6)
    }
}
