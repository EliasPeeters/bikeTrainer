import SwiftUI
import WattwerkCore

/// Eine Messgröße des Sekundenverlaufs.
///
/// Jede bringt ihre eigene Farbe, Einheit und Skala mit. Sie gemeinsam auf eine
/// Achse zu legen ginge nicht: 250 W und 150 bpm und 90 U/min haben keinen
/// gemeinsamen Maßstab, und einer, der alle drei fasst, drückt jede einzelne
/// Kurve flach.
public enum RideMetric: String, CaseIterable, Identifiable, Sendable {
    case power
    case heartRate
    case cadence
    case speed

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .power: return "Leistung"
        case .heartRate: return "Puls"
        case .cadence: return "Trittfrequenz"
        case .speed: return "Tempo"
        }
    }

    public var unit: String {
        switch self {
        case .power: return "W"
        case .heartRate: return "bpm"
        case .cadence: return "U/min"
        case .speed: return "km/h"
        }
    }

    public var color: Color {
        switch self {
        case .power: return Theme.accent
        case .heartRate: return Theme.heartRate
        case .cadence: return Theme.cadence
        case .speed: return Theme.positive
        }
    }

    /// Die Werte dieser Größe, `nil` wo nichts gemessen wurde.
    func values(in samples: [RideSample]) -> [Double?] {
        switch self {
        case .power: return samples.map { Double($0.power) }
        case .heartRate: return samples.map { $0.heartRate.map(Double.init) }
        case .cadence: return samples.map { $0.cadence.map(Double.init) }
        case .speed: return samples.map(\.speed)
        }
    }

    /// Eine Größe, von der es in dieser Fahrt keinen einzigen Wert gibt, wird
    /// gar nicht erst angeboten - ein leerer Knopf ist ein Versprechen, das die
    /// Fahrt nicht halten kann.
    func isPresent(in samples: [RideSample]) -> Bool {
        switch self {
        case .power: return !samples.isEmpty
        case .heartRate: return samples.contains { ($0.heartRate ?? 0) > 0 }
        case .cadence: return samples.contains { ($0.cadence ?? 0) > 0 }
        case .speed: return samples.contains { ($0.speed ?? 0) > 0 }
        }
    }
}

/// Der Sekundenverlauf einer Fahrt, eine Kurve je gewählter Messgröße.
///
/// Gezeichnet mit `Canvas` statt mit Swift Charts: es sind ein paar tausend
/// Punkte je Kurve, und Swift Charts baut daraus ebenso viele Views. Auf dem
/// Apple TV reicht das, um das Scrollen spürbar zäh zu machen.
public struct RideTrackChart: View {
    let samples: [RideSample]
    let ftp: Int
    let metrics: Set<RideMetric>

    public init(samples: [RideSample], ftp: Int, metrics: Set<RideMetric>) {
        self.samples = samples
        self.ftp = ftp
        self.metrics = metrics
    }

    /// Ungefähr so viele Punkte werden gezeichnet, egal wie lang die Fahrt war.
    /// Darüber hinaus liegen mehrere Sekunden auf demselben Pixel.
    private static let maxPoints = 1200

    public var body: some View {
        Canvas { context, size in
            guard samples.count > 1 else { return }

            if metrics.contains(.power) {
                drawFTPLine(in: context, size: size)
            }

            // Leistung zuerst, damit Puls und Trittfrequenz oben liegen: die
            // Wattkurve ist die unruhigste und würde die anderen sonst
            // zerschneiden.
            for metric in RideMetric.allCases where metrics.contains(metric) {
                draw(metric, in: context, size: size)
            }
        }
        .frame(height: 190 * Theme.scale)
        .padding(12)
        .cardBackground()
    }

    private func drawFTPLine(in context: GraphicsContext, size: CGSize) {
        let scale = self.scale(for: .power)
        guard scale.upper > Double(ftp) else { return }
        let y = size.height - size.height * ((Double(ftp) - scale.lower) / (scale.upper - scale.lower))
        var path = Path()
        path.move(to: CGPoint(x: 0, y: y))
        path.addLine(to: CGPoint(x: size.width, y: y))
        context.stroke(
            path,
            with: .color(.white.opacity(0.18)),
            style: StrokeStyle(lineWidth: 1, dash: [4, 4])
        )
    }

    private func draw(_ metric: RideMetric, in context: GraphicsContext, size: CGSize) {
        let points = reduced(metric.values(in: samples))
        let scale = self.scale(for: metric)
        let span = max(1, scale.upper - scale.lower)
        guard points.count > 1 else { return }

        let stepX = size.width / Double(points.count - 1)
        func position(_ value: Double, _ index: Int) -> CGPoint {
            CGPoint(
                x: Double(index) * stepX,
                y: size.height - size.height * ((value - scale.lower) / span)
            )
        }

        // Jede zusammenhängende Strecke wird für sich gezeichnet. Ein Loch -
        // der Pulsgurt war kurz weg - darf keine gerade Linie darüber ziehen,
        // die aussieht wie eine Messung.
        var line = Path()
        var runStart: Int?
        for (index, value) in points.enumerated() {
            guard let value else {
                runStart = nil
                continue
            }
            if runStart == nil {
                runStart = index
                line.move(to: position(value, index))
            } else {
                line.addLine(to: position(value, index))
            }
        }

        if metric == .power {
            context.fill(
                area(from: points, size: size, scale: scale, stepX: stepX),
                with: .linearGradient(
                    Gradient(colors: [metric.color.opacity(0.35), metric.color.opacity(0.02)]),
                    startPoint: .zero,
                    endPoint: CGPoint(x: 0, y: size.height)
                )
            )
            drawTarget(in: context, size: size, scale: scale, stepX: stepX, count: points.count)
        }

        context.stroke(line, with: .color(metric.color), lineWidth: metric == .power ? 1.4 : 1.8)
    }

    /// Die Vorgabe, die der Trainer bekommen hat - gestrichelt über der
    /// tatsächlichen Leistung. Der Vergleich der beiden ist der eigentliche
    /// Grund, warum man sich die Kurve hinterher ansieht.
    private func drawTarget(
        in context: GraphicsContext,
        size: CGSize,
        scale: (lower: Double, upper: Double),
        stepX: Double,
        count: Int
    ) {
        let targets = reduced(samples.map { $0.targetPower.map(Double.init) })
        guard targets.contains(where: { $0 != nil }) else { return }
        let span = max(1, scale.upper - scale.lower)

        var path = Path()
        var open = false
        for (index, value) in targets.prefix(count).enumerated() {
            guard let value else {
                open = false
                continue
            }
            let point = CGPoint(
                x: Double(index) * stepX,
                y: size.height - size.height * ((value - scale.lower) / span)
            )
            if open {
                path.addLine(to: point)
            } else {
                path.move(to: point)
                open = true
            }
        }
        context.stroke(
            path,
            with: .color(.white.opacity(0.55)),
            style: StrokeStyle(lineWidth: 1.2, dash: [5, 3])
        )
    }

    private func area(
        from points: [Double?],
        size: CGSize,
        scale: (lower: Double, upper: Double),
        stepX: Double
    ) -> Path {
        let span = max(1, scale.upper - scale.lower)
        var path = Path()
        path.move(to: CGPoint(x: 0, y: size.height))
        for (index, value) in points.enumerated() {
            let y = size.height - size.height * (((value ?? scale.lower) - scale.lower) / span)
            path.addLine(to: CGPoint(x: Double(index) * stepX, y: y))
        }
        path.addLine(to: CGPoint(x: Double(points.count - 1) * stepX, y: size.height))
        path.closeSubpath()
        return path
    }

    /// Ober- und Untergrenze der Achse dieser Größe.
    ///
    /// Leistung beginnt bei null, weil eine Wattkurve über einer abgeschnittenen
    /// Grundlinie jede Pause wie einen Einbruch aussehen lässt. Puls und
    /// Trittfrequenz dagegen spielen sich in einem engen Band ab - dort wäre
    /// eine Achse ab null eine flache Linie in der oberen Bildhälfte.
    private func scale(for metric: RideMetric) -> (lower: Double, upper: Double) {
        let values = metric.values(in: samples).compactMap { $0 }.filter { $0 > 0 }
        guard let low = values.min(), let high = values.max() else { return (0, 1) }

        switch metric {
        case .power:
            return (0, max(high * 1.1, Double(ftp) * 1.2))
        case .heartRate, .cadence, .speed:
            let padding = max(5, (high - low) * 0.15)
            return (max(0, low - padding), high + padding)
        }
    }

    /// Fasst benachbarte Sekunden zusammen, bis höchstens `maxPoints` übrig
    /// sind. Der Mittelwert je Eimer, nicht jeder n-te Wert: sonst hinge das
    /// Bild davon ab, welche Sekunde zufällig auf den Raster fällt.
    private func reduced(_ values: [Double?]) -> [Double?] {
        guard values.count > Self.maxPoints else { return values }
        let bucket = Int(ceil(Double(values.count) / Double(Self.maxPoints)))
        return stride(from: 0, to: values.count, by: bucket).map { start in
            let slice = values[start..<min(start + bucket, values.count)].compactMap { $0 }
            return slice.isEmpty ? nil : slice.reduce(0, +) / Double(slice.count)
        }
    }
}

/// Die Knöpfe, mit denen man Kurven ein- und ausblendet.
public struct RideMetricPicker: View {
    let available: [RideMetric]
    @Binding var selection: Set<RideMetric>

    public init(available: [RideMetric], selection: Binding<Set<RideMetric>>) {
        self.available = available
        self._selection = selection
    }

    public var body: some View {
        HStack(spacing: 10) {
            ForEach(available) { metric in
                Button {
                    // Die letzte Kurve lässt sich nicht auch noch abschalten -
                    // ein leeres Diagramm ist kein Zustand, den jemand wollte.
                    if selection.contains(metric) {
                        if selection.count > 1 { selection.remove(metric) }
                    } else {
                        selection.insert(metric)
                    }
                } label: {
                    HStack(spacing: 7) {
                        Circle()
                            .fill(metric.color)
                            .frame(width: 9 * Theme.scale, height: 9 * Theme.scale)
                            .opacity(selection.contains(metric) ? 1 : 0.3)
                        Text(metric.label)
                            .font(.system(size: 13 * Theme.scale, weight: .medium))
                    }
                    .padding(.horizontal, 12 * Theme.scale)
                    .padding(.vertical, 7 * Theme.scale)
                    .background(
                        Capsule().fill(
                            selection.contains(metric) ? Theme.surfaceRaised : Color.white.opacity(0.05)
                        )
                    )
                    .foregroundStyle(selection.contains(metric) ? Color.primary : Color.secondary)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
