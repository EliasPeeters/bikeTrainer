#if !os(tvOS)
import SwiftUI
import WattwerkCore

/// Build a workout: a list of blocks, each with a duration and a target.
///
/// Mac and iPad only. Editing a structured workout with a TV remote is a bad
/// idea, so the TV app shows the catalogue read-only.
struct WorkoutEditorView: View {
    @State private var draft: Workout
    @State private var intervalCount = 4
    @State private var intervalWorkMinutes = 4
    @State private var intervalWorkPercent = 105
    @State private var intervalRestMinutes = 3
    @State private var intervalRestPercent = 55
    @State private var showsIntervalBuilder = false

    let ftp: Int
    let onSave: (Workout) -> Void

    @Environment(\.dismiss) private var dismiss

    init(workout: Workout, ftp: Int, onSave: @escaping (Workout) -> Void) {
        _draft = State(initialValue: workout)
        self.ftp = ftp
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    metadata
                    preview
                    segmentList
                    addButtons
                    if showsIntervalBuilder { intervalBuilder }
                }
                .padding(24)
            }
            .background(Theme.background)
            .navigationTitle(draft.isBuiltIn ? "Kopie bearbeiten" : "Programm bearbeiten")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") {
                        onSave(draft)
                        dismiss()
                    }
                    .disabled(draft.segments.isEmpty || draft.name.isEmpty)
                }
            }
        }
        .frame(minWidth: 720, minHeight: 620)
    }

    private var metadata: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Name", text: $draft.name)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 18, weight: .semibold))
            TextField("Kurzbeschreibung", text: $draft.summary, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...3)
            if draft.isBuiltIn {
                Label(
                    "Mitgelieferte Programme werden beim Sichern als eigene Kopie angelegt.",
                    systemImage: "info.circle"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .cardBackground()
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 10) {
            WorkoutProfileChart(workout: draft, ftp: ftp)
                .frame(height: 120)
            HStack(spacing: 22) {
                Label(Formatting.compactDuration(draft.duration), systemImage: "clock")
                Label("\(draft.plannedTSS(ftp: ftp)) TSS", systemImage: "flame")
                Label("IF \(Formatting.decimal(draft.intensityFactor(ftp: ftp), places: 2))", systemImage: "gauge")
                Spacer()
                Text("Bei FTP \(ftp) W")
                    .foregroundStyle(.secondary)
            }
            .font(.system(size: 13, weight: .medium))
        }
        .padding(18)
        .cardBackground()
    }

    private var segmentList: some View {
        VStack(spacing: 0) {
            ForEach($draft.segments) { $segment in
                SegmentEditorRow(
                    segment: $segment,
                    ftp: ftp,
                    onDelete: { draft.segments.removeAll { $0.id == segment.id } },
                    onDuplicate: {
                        guard let index = draft.segments.firstIndex(where: { $0.id == segment.id })
                        else { return }
                        var copy = segment
                        copy.id = UUID()
                        draft.segments.insert(copy, at: index + 1)
                    },
                    onMoveUp: { move(segment, by: -1) },
                    onMoveDown: { move(segment, by: 1) }
                )
                Divider().opacity(0.15)
            }
        }
        .padding(.vertical, 6)
        .cardBackground()
    }

    private func move(_ segment: WorkoutSegment, by offset: Int) {
        guard let index = draft.segments.firstIndex(where: { $0.id == segment.id }) else { return }
        let target = index + offset
        guard draft.segments.indices.contains(target) else { return }
        draft.segments.swapAt(index, target)
    }

    private var addButtons: some View {
        HStack(spacing: 12) {
            Button {
                draft.segments.append(.steady(300, percentFTP: 0.75))
            } label: {
                Label("Block hinzufügen", systemImage: "plus")
            }
            Button {
                draft.segments.append(.ramp(300, fromPercentFTP: 0.50, toPercentFTP: 0.90))
            } label: {
                Label("Rampe hinzufügen", systemImage: "chart.line.uptrend.xyaxis")
            }
            Button {
                showsIntervalBuilder.toggle()
            } label: {
                Label("Intervallserie …", systemImage: "repeat")
            }
            Spacer()
        }
        .buttonStyle(.bordered)
    }

    private var intervalBuilder: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Intervallserie einfügen")
                .font(.system(size: 16, weight: .semibold))
            ValueStepper(label: "Wiederholungen", value: $intervalCount, range: 1...30)
            ValueStepper(label: "Belastung", value: $intervalWorkMinutes, range: 1...60, unit: "min")
            ValueStepper(label: "Belastung", value: $intervalWorkPercent, range: 40...200, step: 5, unit: "% FTP")
            ValueStepper(label: "Pause", value: $intervalRestMinutes, range: 1...30, unit: "min")
            ValueStepper(label: "Pause", value: $intervalRestPercent, range: 30...90, step: 5, unit: "% FTP")

            Button {
                draft.segments.append(
                    contentsOf: BuiltInWorkouts.intervals(
                        count: intervalCount,
                        work: Double(intervalWorkMinutes) * 60,
                        workPercent: Double(intervalWorkPercent) / 100,
                        rest: Double(intervalRestMinutes) * 60,
                        restPercent: Double(intervalRestPercent) / 100,
                        label: "Intervall"
                    )
                )
                showsIntervalBuilder = false
            } label: {
                Label("Einfügen", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(Theme.surfaceRaised)
    }
}

/// One editable block.
struct SegmentEditorRow: View {
    @Binding var segment: WorkoutSegment
    let ftp: Int
    let onDelete: () -> Void
    let onDuplicate: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void

    enum Kind: String, CaseIterable, Identifiable {
        case steady = "Konstant"
        case ramp = "Rampe"
        case free = "Frei"
        var id: String { rawValue }
    }

    enum Unit: String, CaseIterable, Identifiable {
        case percent = "% FTP"
        case watts = "W"
        var id: String { rawValue }
    }

    private var kind: Kind {
        switch segment.intensity {
        case let .steady(target): return target.isFree ? .free : .steady
        case .ramp: return .ramp
        }
    }

    private var unit: Unit {
        if case .watts = segment.intensity.startTarget { return .watts }
        return .percent
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Theme.zoneColor(segment.zone(ftp: ftp)))
                    .frame(width: 5, height: 30)

                Picker("", selection: Binding(get: { kind }, set: setKind)) {
                    ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
                }
                .labelsHidden()
                .frame(width: 110)

                durationFields

                if kind != .free {
                    valueFields
                    Picker("", selection: Binding(get: { unit }, set: setUnit)) {
                        ForEach(Unit.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .labelsHidden()
                    .frame(width: 90)
                }

                Spacer()

                Button(action: onMoveUp) { Image(systemName: "arrow.up") }
                Button(action: onMoveDown) { Image(systemName: "arrow.down") }
                Button(action: onDuplicate) { Image(systemName: "plus.square.on.square") }
                Button(role: .destructive, action: onDelete) { Image(systemName: "trash") }
            }
            .buttonStyle(.borderless)

            TextField(
                "Bezeichnung (optional)",
                text: Binding(
                    get: { segment.title ?? "" },
                    set: { segment.title = $0.isEmpty ? nil : $0 }
                )
            )
            .textFieldStyle(.roundedBorder)
            .font(.caption)
            .padding(.leading, 15)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var durationFields: some View {
        HStack(spacing: 4) {
            TextField("min", value: Binding(
                get: { Int(segment.duration) / 60 },
                set: { segment.duration = Double($0 * 60 + Int(segment.duration) % 60) }
            ), format: .number)
            .frame(width: 44)
            Text(":")
            TextField("s", value: Binding(
                get: { Int(segment.duration) % 60 },
                set: { segment.duration = Double((Int(segment.duration) / 60) * 60 + min(max($0, 0), 59)) }
            ), format: .number)
            .frame(width: 44)
        }
        .textFieldStyle(.roundedBorder)
        .multilineTextAlignment(.trailing)
        .monospacedDigit()
    }

    private var valueFields: some View {
        HStack(spacing: 6) {
            TextField("Start", value: Binding(
                get: { number(segment.intensity.startTarget) },
                set: { setStart($0) }
            ), format: .number)
            .frame(width: 62)

            if kind == .ramp {
                Image(systemName: "arrow.right")
                    .foregroundStyle(.secondary)
                TextField("Ende", value: Binding(
                    get: { number(segment.intensity.endTarget) },
                    set: { setEnd($0) }
                ), format: .number)
                .frame(width: 62)
            }
        }
        .textFieldStyle(.roundedBorder)
        .multilineTextAlignment(.trailing)
        .monospacedDigit()
    }

    // MARK: Conversions between the UI's plain integers and `PowerTarget`

    private func number(_ target: PowerTarget) -> Int {
        switch target {
        case let .watts(watts): return watts
        case let .percentFTP(fraction): return Int((fraction * 100).rounded())
        case .free: return 0
        }
    }

    private func makeTarget(_ value: Int) -> PowerTarget {
        unit == .watts ? .watts(max(0, value)) : .percentFTP(Double(max(0, value)) / 100)
    }

    private func setStart(_ value: Int) {
        switch segment.intensity {
        case .steady:
            segment.intensity = .steady(makeTarget(value))
        case let .ramp(_, to):
            segment.intensity = .ramp(from: makeTarget(value), to: to)
        }
    }

    private func setEnd(_ value: Int) {
        guard case let .ramp(from, _) = segment.intensity else { return }
        segment.intensity = .ramp(from: from, to: makeTarget(value))
    }

    private func setKind(_ newKind: Kind) {
        let current = segment.intensity.startTarget
        switch newKind {
        case .steady:
            segment.intensity = .steady(current.isFree ? .percentFTP(0.75) : current)
        case .ramp:
            let start = current.isFree ? PowerTarget.percentFTP(0.50) : current
            let end = unit == .watts
                ? PowerTarget.watts(number(start) + 50)
                : PowerTarget.percentFTP(Double(number(start) + 20) / 100)
            segment.intensity = .ramp(from: start, to: end)
        case .free:
            segment.intensity = .steady(.free)
        }
    }

    private func setUnit(_ newUnit: Unit) {
        guard newUnit != unit else { return }
        func convert(_ target: PowerTarget) -> PowerTarget {
            switch newUnit {
            case .watts:
                return .watts(target.resolvedWatts(ftp: ftp) ?? 0)
            case .percent:
                let watts = target.resolvedWatts(ftp: ftp) ?? 0
                return .percentFTP(ftp > 0 ? Double(watts) / Double(ftp) : 0)
            }
        }
        switch segment.intensity {
        case let .steady(target):
            segment.intensity = .steady(target.isFree ? target : convert(target))
        case let .ramp(from, to):
            segment.intensity = .ramp(from: convert(from), to: convert(to))
        }
    }
}
#endif
