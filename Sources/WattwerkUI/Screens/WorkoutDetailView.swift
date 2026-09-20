import SwiftUI
import WattwerkCore

/// Everything about one workout, plus the button that starts it.
///
/// Auf dem Mac ist das eine Seite zum Scrollen. Auf dem Apple TV passt alles
/// auf einen Blick nebeneinander: links das Programm und der Startknopf,
/// rechts der Ablauf. Dazu oben ein sichtbarer Weg zurück - die Menütaste
/// funktioniert zwar, aber man muss sie auch sehen können.
struct WorkoutDetailView: View {
    let model: AppModel
    @State var workout: Workout
    @State private var isEditing = false
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focus: Field?

    private enum Field: Hashable {
        case back
        case start
    }

    private var ftp: Int { model.settings.rider.ftp }

    var body: some View {
        #if os(tvOS)
        tvBody
        #else
        pageBody
        #endif
    }

    // MARK: Apple TV

    #if os(tvOS)
    private var tvBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            topBar

            HStack(alignment: .top, spacing: 44) {
                VStack(alignment: .leading, spacing: 26) {
                    WorkoutProfileChart(workout: workout, ftp: ftp)
                        .frame(height: 220)
                    statsRow
                    startButton
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                segmentList
                    .frame(width: 560)
            }
            .padding(.horizontal, Theme.pageInset)
            .padding(.bottom, Theme.pageInset * 0.7)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.background)
        .defaultFocus($focus, .start)
    }

    /// Titel und Weg zurück. Oben links, wo auf dem Apple TV alles beginnt.
    private var topBar: some View {
        HStack(alignment: .center, spacing: 28) {
            Button {
                dismiss()
            } label: {
                Label("Zurück", systemImage: "chevron.left")
                    .font(.system(size: 22, weight: .semibold))
            }
            .buttonStyle(.bordered)
            .focused($focus, equals: .back)

            VStack(alignment: .leading, spacing: 6) {
                Text(workout.name)
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if !workout.summary.isEmpty {
                    Text(workout.summary)
                        .font(.system(size: 22))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 20)

            badgeRow
        }
        .padding(.horizontal, Theme.pageInset)
        .padding(.top, 20)
        .padding(.bottom, 30)
    }
    #endif

    // MARK: Mac

    private var pageBody: some View {
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
        .sectionTitle(workout.name)
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

    // MARK: Gemeinsame Bausteine

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workout.name)
                .font(.system(size: 30 * Theme.scale, weight: .bold, design: .rounded))
            if !workout.summary.isEmpty {
                Text(workout.summary)
                    .font(.system(size: 15 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
            badgeRow
        }
    }

    private var badgeRow: some View {
        HStack(spacing: 8) {
            ForEach(workout.tags, id: \.self) { tag in
                badge(tag)
            }
            if workout.isBuiltIn {
                badge("Katalog")
            } else if workout.visibility == .public {
                badge("Öffentlich", tint: Theme.positive)
            } else {
                badge("Privat")
            }
            if let owner = workout.ownerName, !workout.isBuiltIn {
                badge("von \(owner)")
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
        .cardBackground(Theme.surfaceRaised)
    }

    private func badge(_ text: String, tint: Color = .white) -> some View {
        Text(text)
            .font(.system(size: 12 * Theme.scale, weight: .medium))
            .foregroundStyle(tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(tint == .white ? Color.white.opacity(0.10) : tint.opacity(0.20)))
    }

    /// Nur eigene Programme lassen sich teilen - und nur mit Konto, weil ein
    /// öffentliches Programm irgendwo liegen muss.
    private var canShare: Bool {
        model.account.isSignedIn && !workout.isBuiltIn
    }

    @ViewBuilder
    private var shareButton: some View {
        if canShare {
            Button {
                workout.visibility = workout.visibility == .public ? .private : .public
                workout.updatedAt = Date()
                model.save(workout)
            } label: {
                Label(
                    workout.visibility == .public ? "Privat stellen" : "Öffentlich teilen",
                    systemImage: workout.visibility == .public ? "lock" : "globe"
                )
            }
            .buttonStyle(.bordered)
        }
    }

    private var startButton: some View {
        VStack(alignment: .leading, spacing: 10) {
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
            .dimmedWhenUnavailable(!model.hasPowerSource)
            .focused($focus, equals: .start)

            shareButton

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

            // Auf dem Apple TV eine eigene Bildlauffläche: der Ablauf kann lang
            // werden, soll aber den Startknopf nicht aus dem Bild schieben.
            segmentScroller
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(Theme.surfaceRaised)
    }

    @ViewBuilder
    private var segmentScroller: some View {
        #if os(tvOS)
        // Kurze Programme passen ganz aufs Bild - dann soll die Karte auch nur
        // so hoch sein. Erst ein langer Ablauf bekommt eine Bildlauffläche,
        // deren Zeilen sich mit der Fernbedienung ansteuern lassen.
        if workout.segments.count > 9 {
            ScrollView(showsIndicators: false) {
                segmentRows
            }
            .frame(height: 560)
            .focusGroup()
        } else {
            segmentRows
        }
        #else
        segmentRows
        #endif
    }

    private var segmentRows: some View {
        VStack(spacing: 0) {
            ForEach(Array(workout.segments.enumerated()), id: \.element.id) { index, segment in
                VStack(spacing: 0) {
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
                    .reachableByRemote()

                    if index < workout.segments.count - 1 {
                        Divider().opacity(0.2)
                    }
                }
            }
        }
    }
}
