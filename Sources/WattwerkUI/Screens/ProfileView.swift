import SwiftUI
import WattwerkCore

/// Rider profile and the handful of app settings that exist.
struct ProfileView: View {
    let model: AppModel
    @State private var ftpMessage: String?

    private var rider: RiderProfile { model.settings.rider }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                riderCard
                ftpCard
                appCard
                aboutCard
            }
            .padding(24)
            .frame(maxWidth: 820 * Theme.scale)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.background)
        .sectionTitle("Profil")
    }

    private var riderCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Fahrer")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))

            #if !os(tvOS)
            TextField("Name", text: Binding(
                get: { model.settings.rider.name },
                set: { model.settings.rider.name = $0 }
            ))
            .textFieldStyle(.roundedBorder)
            #endif

            ValueStepper(
                label: "Maximalpuls",
                value: Binding(
                    get: { model.settings.rider.maxHeartRate },
                    set: { model.settings.rider.maxHeartRate = $0 }
                ),
                range: 120...230,
                step: 1,
                unit: "bpm"
            )
            ValueStepper(
                label: "Ruhepuls",
                value: Binding(
                    get: { model.settings.rider.restingHeartRate },
                    set: { model.settings.rider.restingHeartRate = $0 }
                ),
                range: 30...100,
                step: 1,
                unit: "bpm"
            )
            ValueStepper(
                label: "Gewicht",
                value: Binding(
                    get: { Int(model.settings.rider.weightKg.rounded()) },
                    set: { model.settings.rider.weightKg = Double($0) }
                ),
                range: 35...180,
                step: 1,
                unit: "kg"
            )
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private var ftpCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("Schwellenleistung (FTP)")
                    .font(.system(size: 18 * Theme.scale, weight: .semibold))
                Spacer()
                Text("\(Formatting.decimal(rider.wattsPerKilo, places: 2)) W/kg")
                    .font(.system(size: 14 * Theme.scale))
                    .foregroundStyle(.secondary)
            }

            ValueStepper(
                label: "FTP",
                value: Binding(
                    get: { model.settings.rider.ftp },
                    set: {
                        model.settings.rider.ftp = $0
                        model.settings.rider.ftpUpdatedAt = Date()
                        model.engine.setFTP($0)
                    }
                ),
                range: 50...600,
                step: 5,
                unit: "W"
            )

            Text("Alle Programme rechnen in Prozent der FTP. Wenn sich die FTP ändert, passen sich alle Vorgaben automatisch an.")
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)

            Button {
                if let newFTP = model.applyFTPFromLastRamp() {
                    ftpMessage = "FTP aus der letzten Einheit auf \(newFTP) W gesetzt."
                } else {
                    ftpMessage = "Keine passende Einheit gefunden. Fahre zuerst den Rampentest."
                }
            } label: {
                Label("FTP aus letztem Rampentest übernehmen", systemImage: "wand.and.stars")
            }
            .buttonStyle(.bordered)

            if let ftpMessage {
                Text(ftpMessage)
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(Theme.accent)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private var appCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("App")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))

            ValueStepper(
                label: "Countdown vor dem Start",
                value: Binding(
                    get: { model.settings.settings.startCountdownSeconds },
                    set: { model.settings.settings.startCountdownSeconds = $0 }
                ),
                range: 0...30,
                step: 1,
                unit: "s"
            )

            Toggle("Bildschirm während der Fahrt wach halten", isOn: Binding(
                get: { model.settings.settings.preventsDisplaySleep },
                set: { model.settings.settings.preventsDisplaySleep = $0 }
            ))

            Toggle("Simulator statt echtem Trainer", isOn: Binding(
                get: { model.settings.settings.simulatorEnabled },
                set: { model.setSimulatorEnabled($0) }
            ))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private var aboutCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Wattwerk")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))
            Text("Strukturiertes Indoor-Training für Mac und Apple TV. Spricht FTMS über Bluetooth Low Energy und steuert damit jeden kompatiblen Smarttrainer.")
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
            #if os(tvOS)
            Text("Auf dem Apple TV werden Einheiten ohne Sekundenaufzeichnung gespeichert - dort steht nur ein kleiner Speicher zur Verfügung. Programme bearbeitest du am Mac.")
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
            #endif
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}
