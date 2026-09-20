import SwiftUI
import WattwerkCore

/// Everything about one workout, plus the button that starts it.
struct WorkoutDetailView: View {
    let model: AppModel
    @State var workout: Workout
    @State private var isEditing = false
    @Environment(\.dismiss) private var dismiss

    private var ftp: Int { model.settings.rider.ftp }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                WorkoutProfileChart(workout: workout, ftp: ftp)
                    .frame(height: 180 * Theme.scale)
                statsRow
                startButton
                segmentList
            }
            .padding(24)
        }
        .background(Theme.background)
        .navigationTitle(workout.name)
        #if !os(tvOS)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    isEditing = true
                } label: {
                    Label("Bearbeiten", systemImage: "slider.horizontal.3")
                }
                Menu {
                    Button("Duplizieren") { model.library.duplicate(workout) }
                    if !workout.isBuiltIn {
                        Button("Löschen", role: .destructive) {
                            model.delete(workout)
                            dismiss()
                        }
                    }
                } label: {
                    Label("Mehr", systemImage: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $isEditing) {
            WorkoutEditorView(workout: workout, ftp: ftp) { saved in
                workout = model.library.save(saved)
            }
        }
        #endif
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workout.name)
                .font(.system(size: 30 * Theme.scale, weight: .bold, design: .rounded))
            if !workout.summary.isEmpty {
                Text(workout.summary)
                    .font(.system(size: 15 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
            if !workout.tags.isEmpty {
                HStack(spacing: 8) {
                    ForEach(workout.tags, id: \.self) { tag in
                        Text(tag)
                            .font(.system(size: 12 * Theme.scale, weight: .medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Color.white.opacity(0.10)))
                    }
                }
            }
        }
    }

    private var statsRow: some View {
        HStack(spacing: 16) {
            MetricTile(label: "Dauer", value: Formatting.compactDuration(workout.duration))
            MetricTile(label: "Belastung", value: "\(workout.plannedTSS(ftp: ftp))", unit: "TSS")
            MetricTile(
                label: "Intensität",
                value: Formatting.decimal(workout.intensityFactor(ftp: ftp), places: 2),
                unit: "IF"
            )
            MetricTile(label: "Spitze", value: "\(workout.peakWatts(ftp: ftp))", unit: "W")
        }
        .padding(16)
        .cardBackground()
    }

    private var startButton: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                model.startRide(workout)
            } label: {
                Label("Einheit starten", systemImage: "play.fill")
                    .font(.system(size: 18 * Theme.scale, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.hasPowerSource)

            if !model.hasPowerSource {
                Text("Kein Trainer verbunden. Unter „Geräte“ verbinden oder den Simulator einschalten.")
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(.secondary)
            } else if !model.canControlTrainer {
                Text("Der Trainer liefert nur Messwerte. Die Zielvorgabe wird angezeigt, aber nicht automatisch eingestellt.")
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(Theme.accent)
            }
        }
    }

    private var segmentList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Ablauf")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))
                .padding(.bottom, 10)

            ForEach(Array(workout.segments.enumerated()), id: \.element.id) { index, segment in
                HStack(spacing: 14) {
                    Text("\(index + 1)")
                        .font(.system(size: 13 * Theme.scale, weight: .bold))
                        .frame(width: 28 * Theme.scale)
                        .foregroundStyle(.secondary)

                    RoundedRectangle(cornerRadius: 3)
                        .fill(Theme.zoneColor(segment.zone(ftp: ftp)))
                        .frame(width: 5, height: 26 * Theme.scale)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(segment.displayTitle(ftp: ftp))
                            .font(.system(size: 15 * Theme.scale, weight: .medium))
                        if let cadence = segment.cadenceTarget {
                            Text("Trittfrequenz \(cadence.lowerBound)–\(cadence.upperBound) U/min")
                                .font(.system(size: 12 * Theme.scale))
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    Text(Formatting.clock(segment.duration))
                        .font(.system(size: 15 * Theme.scale, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
                if index < workout.segments.count - 1 {
                    Divider().opacity(0.2)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}
