import SwiftUI
import WattwerkCore
#if !os(tvOS)
import UniformTypeIdentifiers
#endif

/// Past rides, newest first.
struct HistoryView: View {
    let model: AppModel

    private var weeklyStress: Int {
        model.sessions.stressLast(days: 7)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    summaryHeader

                    if model.sessions.sessions.isEmpty {
                        ContentUnavailableView(
                            "Noch keine Einheiten",
                            systemImage: "calendar",
                            description: Text("Sobald du eine Einheit fährst und speicherst, erscheint sie hier.")
                        )
                        .padding(.top, 40)
                    }

                    ForEach(model.sessions.sessions) { record in
                        NavigationLink(value: record) {
                            // Ohne Konto gibt es keinen Server, auf dem etwas
                            // fehlen könnte - dann ist „ausstehend“ keine
                            // Information, sondern nur ein Warnzeichen zu viel.
                            SessionRow(
                                record: record,
                                isAwaitingUpload: model.account.isSignedIn && record.uploadedAt == nil
                            )
                        }
                        .buttonStyle(CardButtonStyle())
                        .withoutSystemFocusEffect()
                    }
                }
                .padding(Theme.pageInset)
            }
            .background(Theme.background)
            .sectionTitle("Verlauf")
            .navigationDestination(for: SessionRecord.self) { record in
                SessionDetailView(model: model, record: record)
            }
        }
    }

    private var summaryHeader: some View {
        HStack(spacing: 16) {
            MetricTile(label: "Diese Woche", value: "\(weeklyStress)", unit: "TSS", size: .large)
            MetricTile(label: "Einheiten", value: "\(model.sessions.sessions.count)", size: .large)
            MetricTile(
                label: "Letzte Einheit",
                value: model.sessions.sessions.first.map {
                    Formatting.compactDuration($0.duration)
                } ?? "--",
                size: .large
            )
        }
        .padding(18)
        .cardBackground()
    }
}

struct SessionRow: View {
    let record: SessionRecord
    var isAwaitingUpload = false

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "EEE, d. MMM · HH:mm"
        return formatter
    }()

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(record.workoutName)
                    .font(.system(size: 16 * Theme.scale, weight: .semibold))
                HStack(spacing: 8) {
                    Text(Self.dateFormatter.string(from: record.startedAt))
                        .font(.system(size: 12 * Theme.scale))
                        .foregroundStyle(.secondary)
                    if isAwaitingUpload {
                        Label("Noch nicht hochgeladen", systemImage: "icloud.and.arrow.up")
                            .font(.system(size: 12 * Theme.scale, weight: .medium))
                            .foregroundStyle(Theme.accent)
                    }
                }
            }

            Spacer()

            HStack(spacing: 20) {
                statColumn("Dauer", Formatting.compactDuration(record.duration))
                statColumn("Ø", "\(record.averagePower) W")
                statColumn("NP", "\(record.normalizedPower) W")
                statColumn("TSS", "\(record.trainingStressScore)")
            }

            if !record.completed {
                Image(systemName: "flag.slash")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16 * Theme.scale * 0.8)
        .cardBackground(Theme.surfaceRaised)
        .overlay {
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
        }
    }

    private func statColumn(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 15 * Theme.scale, weight: .semibold))
                .monospacedDigit()
            Text(label)
                .font(.system(size: 11 * Theme.scale))
                .foregroundStyle(.secondary)
        }
    }
}

struct SessionDetailView: View {
    let model: AppModel
    let record: SessionRecord
    @Environment(\.dismiss) private var dismiss
    @State private var shownMetrics: Set<RideMetric> = [.power]
    /// Einmal geladen, nicht bei jedem Zeichnen neu.
    ///
    /// Die Spur kann in der Einheit stecken oder daneben liegen - auf dem Apple
    /// TV ist sie nicht Teil des Verlaufs, sondern liegt komprimiert im
    /// Zwischenlager. Sie in einer berechneten Eigenschaft zu holen hieße, sie
    /// mehrmals je Bildaufbau zu entpacken.
    /// `nil`, solange noch nicht nachgesehen wurde - sonst stünde für einen
    /// Bildaufbau „Kein Sekundenverlauf“ da, obwohl es einen gibt.
    @State private var samples: [RideSample]?
    #if !os(tvOS)
    @State private var isExporting = false
    #endif

    private var availableMetrics: [RideMetric] {
        RideMetric.allCases.filter { $0.isPresent(in: samples ?? []) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                #if os(tvOS)
                // Ohne Navigationstitel braucht diese Seite einen sichtbaren
                // Weg zurück - die Menütaste allein sieht man nicht.
                topBar
                #endif

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 150 * Theme.scale), spacing: 16)],
                    spacing: 16
                ) {
                    MetricTile(label: "Dauer", value: Formatting.clock(record.duration), size: .large)
                    MetricTile(label: "Ø Leistung", value: "\(record.averagePower)", unit: "W", size: .large)
                    MetricTile(label: "Max", value: "\(record.maxPower)", unit: "W", size: .large)
                    MetricTile(label: "NP", value: "\(record.normalizedPower)", unit: "W", size: .large)
                    MetricTile(
                        label: "IF",
                        value: Formatting.decimal(record.intensityFactor, places: 2),
                        size: .large
                    )
                    MetricTile(label: "TSS", value: "\(record.trainingStressScore)", size: .large)
                    MetricTile(label: "Arbeit", value: "\(record.kilojoules)", unit: "kJ", size: .large)
                    MetricTile(
                        label: "Ø Puls",
                        value: record.averageHeartRate.map(String.init) ?? "--",
                        unit: "bpm",
                        size: .large,
                        tint: Theme.heartRate
                    )
                }
                .padding(18)
                .cardBackground()

                trackSection

                if !record.timeInZone.isEmpty {
                    ZoneBreakdown(buckets: record.timeInZone, total: record.duration)
                }

                #if !os(tvOS)
                HStack(spacing: 12) {
                    Button {
                        isExporting = true
                    } label: {
                        Label("Als CSV exportieren", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.bordered)
                    .disabled(samples?.isEmpty != false)

                    Button(role: .destructive) {
                        model.sessions.delete(id: record.id)
                    } label: {
                        Label("Löschen", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                }
                .fileExporter(
                    isPresented: $isExporting,
                    document: CSVDocument(text: record.csv(samples: samples ?? [])),
                    contentType: .commaSeparatedText,
                    defaultFilename: record.suggestedFileName
                ) { _ in }
                #endif
            }
            .padding(Theme.pageInset)
        }
        .background(Theme.background)
        .sectionTitle(record.workoutName)
        .task(id: record.id) {
            samples = model.sessions.samples(for: record)
        }
    }

    /// Der Sekundenverlauf, mit den Kurven, die diese Fahrt hergibt.
    @ViewBuilder
    private var trackSection: some View {
        let track = samples
        let metrics = availableMetrics

        if track == nil {
            EmptyView()
        } else if let track, track.count > 1 {
            VStack(alignment: .leading, spacing: 12) {
                if metrics.count > 1 {
                    RideMetricPicker(available: metrics, selection: $shownMetrics)
                }
                RideTrackChart(
                    samples: track,
                    ftp: record.ftp,
                    // Nach dem Laden ist nur die Leistung an. Wählt jemand eine
                    // Größe ab, die es hier gar nicht gibt, bliebe sonst ein
                    // leeres Diagramm stehen.
                    metrics: shownMetrics.intersection(metrics).isEmpty
                        ? Set(metrics.prefix(1))
                        : shownMetrics.intersection(metrics)
                )
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Kein Sekundenverlauf")
                    .font(.system(size: 15 * Theme.scale, weight: .semibold))
                Text(
                    model.account.isSignedIn && record.uploadedAt != nil
                        ? "Die Kurve dieser Einheit liegt im Konto - im Web-Portal unter „Verlauf“."
                        : "Diese Einheit wurde ohne Sekundenverlauf gespeichert."
                )
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .cardBackground()
        }
    }

    #if os(tvOS)
    private var topBar: some View {
        HStack(spacing: 28) {
            Button {
                dismiss()
            } label: {
                Label("Zurück", systemImage: "chevron.left")
                    .font(.system(size: 22, weight: .semibold))
            }
            .buttonStyle(.bordered)

            Text(record.workoutName)
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Spacer(minLength: 0)
        }
        .padding(.bottom, 12)
    }
    #endif
}

#if !os(tvOS)
struct CSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }

    var text: String

    init(text: String) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        let data = configuration.file.regularFileContents ?? Data()
        text = String(decoding: data, as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}
#endif
