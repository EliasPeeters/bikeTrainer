import SwiftUI
import WattwerkCore

/// The screen you actually look at while pedalling. Everything on it has to be
/// readable from a TV three metres away, so the type is big and the layout is
/// the same on Mac, iPad and TV - only the scale changes. The iPhone held
/// upright is the one exception: there the readouts stack instead of sitting
/// side by side, and the controls take two rows.
struct RideView: View {
    let model: AppModel

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isNarrow: Bool { horizontalSizeClass == .compact }
    #else
    private var isNarrow: Bool { false }
    #endif

    private var engine: WorkoutEngine { model.engine }
    private var ftp: Int { model.settings.rider.ftp }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            if engine.state == .finished, let record = engine.lastRecord {
                RideSummaryView(model: model, record: record)
            } else {
                hud
            }

            if model.countdown > 0 {
                countdownOverlay
            }
        }
        #if os(tvOS)
        .onPlayPauseCommand { togglePause() }
        #endif
    }

    // MARK: HUD

    @ViewBuilder
    private var hud: some View {
        #if os(iOS)
        // Ein iPhone quer oder ein kleines iPad im geteilten Bildschirm hat
        // weniger Höhe, als der Fahrtbildschirm braucht. Dann lieber scrollen
        // als Knöpfe abschneiden.
        ViewThatFits(in: .vertical) {
            hudContent
            ScrollView { hudContent }
        }
        #else
        hudContent
        #endif
    }

    private var hudContent: some View {
        VStack(spacing: (isNarrow ? 14 : 18) * Theme.scale) {
            header
            mainReadouts
            Spacer(minLength: 0)
            profileStrip
            controls
        }
        .padding(isNarrow ? 16 : 28)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(engine.workout?.name ?? "Fahrt")
                    .font(.system(size: 22 * Theme.scale, weight: .bold, design: .rounded))
                Text(engine.position?.segment.displayTitle(ftp: ftp) ?? "Bereit")
                    .font(.system(size: 15 * Theme.scale))
                    .foregroundStyle(Theme.accent)
                if let next = engine.nextSegment {
                    Text("Danach: \(next.displayTitle(ftp: ftp))")
                        .font(.system(size: 13 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(Formatting.clock(engine.elapsed))
                    .font(.system(size: 30 * Theme.scale, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text("von \(Formatting.clock(engine.totalDuration))")
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(.secondary)
                if engine.state == .paused {
                    Text("Pausiert")
                        .font(.system(size: 13 * Theme.scale, weight: .bold))
                        .foregroundStyle(Theme.accent)
                }
            }
        }
    }

    @ViewBuilder
    private var mainReadouts: some View {
        if isNarrow {
            VStack(alignment: .leading, spacing: 16) {
                powerReadout
                narrowReadouts
            }
            .padding(16)
            .cardBackground()
        } else {
            HStack(alignment: .top, spacing: 24 * Theme.scale) {
                powerReadout
                    .frame(maxWidth: .infinity, alignment: .leading)
                sideReadouts
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
            .cardBackground()
        }
    }

    private var powerReadout: some View {
        VStack(alignment: .leading, spacing: 10) {
            MetricTile(
                label: "Leistung",
                value: Formatting.watts(engine.live.power),
                unit: "W",
                size: .hero,
                tint: Theme.deviationColor(engine.targetDeviation),
                secondary: targetDescription
            )
            TargetBar(
                actual: engine.live.power,
                target: engine.commandedWatts,
                zone: engine.currentZone
            )
        }
    }

    private var sideReadouts: some View {
        VStack(alignment: .leading, spacing: 16 * Theme.scale) {
            MetricTile(
                label: "Restzeit Block",
                value: Formatting.clock(engine.position?.segmentRemaining ?? 0),
                size: .large,
                tint: Theme.accent
            )
            HStack(spacing: 16) {
                MetricTile(
                    label: "Trittfrequenz",
                    value: engine.live.cadence.map(String.init) ?? "--",
                    unit: "U/min",
                    tint: Theme.cadence,
                    secondary: cadenceHint
                )
                MetricTile(
                    label: "Puls",
                    value: engine.live.heartRate.map(String.init) ?? "--",
                    unit: "bpm",
                    tint: Theme.heartRate
                )
            }
            HStack(spacing: 16) {
                MetricTile(label: "Ø Leistung", value: "\(engine.stats.averagePower)", unit: "W")
                MetricTile(label: "NP", value: "\(engine.stats.normalizedPower)", unit: "W")
                MetricTile(label: "Arbeit", value: "\(engine.stats.kilojoules)", unit: "kJ")
            }
        }
    }

    /// Dieselben sechs Werte wie daneben, nur als Raster: untereinander
    /// gestapelt wären sie auf dem iPhone höher als der Bildschirm.
    private var narrowReadouts: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 14) {
            GridRow {
                MetricTile(
                    label: "Restzeit",
                    value: Formatting.clock(engine.position?.segmentRemaining ?? 0),
                    tint: Theme.accent
                )
                MetricTile(
                    label: "Tritt",
                    value: engine.live.cadence.map(String.init) ?? "--",
                    unit: "U/min",
                    tint: Theme.cadence,
                    secondary: cadenceHint
                )
                MetricTile(
                    label: "Puls",
                    value: engine.live.heartRate.map(String.init) ?? "--",
                    unit: "bpm",
                    tint: Theme.heartRate
                )
            }
            GridRow {
                MetricTile(label: "Ø Leistung", value: "\(engine.stats.averagePower)", unit: "W")
                MetricTile(label: "NP", value: "\(engine.stats.normalizedPower)", unit: "W")
                MetricTile(label: "Arbeit", value: "\(engine.stats.kilojoules)", unit: "kJ")
            }
        }
    }

    private var targetDescription: String {
        guard let target = engine.commandedWatts else { return "Freie Fahrt - keine Vorgabe" }
        var text = "Ziel \(target) W"
        if engine.intensityBias != 1.0 {
            text += " (\(Int((engine.intensityBias * 100).rounded())) %)"
        }
        if let zone = engine.currentZone {
            text += " · \(zone.shortName) \(zone.localizedName)"
        }
        return text
    }

    private var cadenceHint: String? {
        guard let range = engine.position?.segment.cadenceTarget else { return nil }
        return "Ziel \(range.lowerBound)–\(range.upperBound)"
    }

    private var profileStrip: some View {
        VStack(spacing: 6) {
            if let workout = engine.workout {
                WorkoutProfileChart(workout: workout, ftp: ftp, progress: engine.progress)
                    .frame(height: (isNarrow ? 64 : 90) * Theme.scale)
            }
            HStack {
                Text("Verbleibend \(Formatting.clock(engine.remaining))")
                Spacer()
                if let error = engine.lastControlError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Theme.negative)
                } else if !model.canControlTrainer {
                    Label("Zielvorgabe nur zur Anzeige", systemImage: "eye")
                        .foregroundStyle(Theme.accent)
                }
            }
            .font(.system(size: 12 * Theme.scale))
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var controls: some View {
        if isNarrow {
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    blockControls
                    Spacer()
                    stopButton
                }
                HStack(spacing: 10) {
                    intensityControls
                    Spacer()
                }
            }
        } else {
            HStack(spacing: 14 * Theme.scale) {
                blockControls
                Divider().frame(height: 30)
                intensityControls
                Spacer()
                stopButton
            }
        }
    }

    @ViewBuilder
    private var blockControls: some View {
        controlButton("Block zurück", systemImage: "backward.end.fill") {
            engine.skipBackward()
        }
        controlButton(
            engine.state == .paused ? "Weiter" : "Pause",
            systemImage: engine.state == .paused ? "play.fill" : "pause.fill"
        ) {
            togglePause()
        }
        controlButton("Block vor", systemImage: "forward.end.fill") {
            engine.skipForward()
        }
    }

    @ViewBuilder
    private var intensityControls: some View {
        controlButton("Leichter", systemImage: "minus") {
            engine.nudgeBias(by: -0.05)
        }
        Text("\(Int((engine.intensityBias * 100).rounded())) %")
            .font(.system(size: 15 * Theme.scale, weight: .semibold))
            .monospacedDigit()
            .frame(width: 66 * Theme.scale)
        controlButton("Härter", systemImage: "plus") {
            engine.nudgeBias(by: 0.05)
        }
    }

    private var stopButton: some View {
        Button(role: .destructive) {
            engine.stop()
        } label: {
            Label("Beenden", systemImage: "stop.fill")
                .lineLimit(1)
                .padding(.horizontal, 8)
        }
        .buttonStyle(.bordered)
        .fixedSize()
    }

    private func controlButton(
        _ title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .labelStyle(.iconOnly)
                .font(.system(size: 18 * Theme.scale, weight: .semibold))
                .frame(width: 44 * Theme.scale, height: 36 * Theme.scale)
        }
        .buttonStyle(.bordered)
        .help(title)
    }

    private func togglePause() {
        if engine.state == .paused {
            engine.resume()
        } else {
            engine.pause()
        }
    }

    // MARK: Countdown

    private var countdownOverlay: some View {
        ZStack {
            Color.black.opacity(0.75).ignoresSafeArea()
            VStack(spacing: 12) {
                Text("\(model.countdown)")
                    .font(.system(size: 140 * Theme.scale, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(countsDown: true))
                Text("Gleich geht es los")
                    .font(.system(size: 20 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
        }
        .animation(.snappy, value: model.countdown)
    }
}
