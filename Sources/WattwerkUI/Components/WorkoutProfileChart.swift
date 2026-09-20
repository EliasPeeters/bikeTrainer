import SwiftUI
import WattwerkCore

/// The shape of a workout, drawn as stacked blocks coloured by training zone.
///
/// Used three times: as a thumbnail in the library, full width in the detail
/// view, and with a playhead during the ride.
public struct WorkoutProfileChart: View {
    let workout: Workout
    let ftp: Int
    /// 0...1 - draws a playhead and dims the part already ridden.
    var progress: Double?
    var showsGrid: Bool = true

    public init(workout: Workout, ftp: Int, progress: Double? = nil, showsGrid: Bool = true) {
        self.workout = workout
        self.ftp = ftp
        self.progress = progress
        self.showsGrid = showsGrid
    }

    /// Head room above the hardest block so the tallest bar is not flush with the top.
    private var ceilingWatts: Double {
        let peak = Double(workout.peakWatts(ftp: ftp))
        return max(peak * 1.12, Double(ftp) * 1.2)
    }

    public var body: some View {
        Canvas { context, size in
            let total = max(workout.duration, 1)
            let blocks = workout.profile(ftp: ftp)

            if showsGrid {
                drawFTPLine(in: &context, size: size)
            }

            for block in blocks {
                let x = size.width * (block.start / total)
                let width = max(size.width * (block.duration / total), 1)
                let startHeight = height(for: block.startWatts, in: size)
                let endHeight = height(for: block.endWatts, in: size)

                var path = Path()
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x, y: size.height - startHeight))
                path.addLine(to: CGPoint(x: x + width, y: size.height - endHeight))
                path.addLine(to: CGPoint(x: x + width, y: size.height))
                path.closeSubpath()

                let isFree = block.startWatts == nil && block.endWatts == nil
                let color = isFree ? Color.gray.opacity(0.35) : Theme.zoneColor(block.zone)
                context.fill(path, with: .color(color.opacity(isFree ? 0.5 : 0.9)))
                // A hairline between blocks keeps long interval sets readable.
                if width > 3 {
                    context.stroke(path, with: .color(Theme.background.opacity(0.7)), lineWidth: 1)
                }
            }

            if let progress {
                let x = size.width * min(max(progress, 0), 1)
                context.fill(
                    Path(CGRect(x: 0, y: 0, width: x, height: size.height)),
                    with: .color(Color.black.opacity(0.35))
                )
                var line = Path()
                line.move(to: CGPoint(x: x, y: 0))
                line.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(line, with: .color(Theme.accent), lineWidth: 2.5)
            }
        }
        .background(Color.black.opacity(0.25))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func height(for watts: Int?, in size: CGSize) -> CGFloat {
        guard let watts else { return size.height * 0.18 }
        return size.height * CGFloat(min(Double(watts) / ceilingWatts, 1.0))
    }

    private func drawFTPLine(in context: inout GraphicsContext, size: CGSize) {
        let y = size.height - size.height * CGFloat(Double(ftp) / ceilingWatts)
        var path = Path()
        path.move(to: CGPoint(x: 0, y: y))
        path.addLine(to: CGPoint(x: size.width, y: y))
        context.stroke(
            path,
            with: .color(Color.white.opacity(0.28)),
            style: StrokeStyle(lineWidth: 1, dash: [4, 4])
        )
    }
}
