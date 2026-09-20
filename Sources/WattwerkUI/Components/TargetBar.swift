import SwiftUI
import WattwerkCore

/// Actual power against the commanded target: a bar that fills towards the
/// target marker. The one control you watch while riding in ERG mode.
public struct TargetBar: View {
    let actual: Int?
    let target: Int?
    let zone: PowerZone?

    public init(actual: Int?, target: Int?, zone: PowerZone?) {
        self.actual = actual
        self.target = target
        self.zone = zone
    }

    /// Scale to 150 % of target so overshooting stays visible.
    private var ceiling: Double {
        let base = Double(target ?? actual ?? 200)
        return max(base * 1.5, 50)
    }

    public var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let actualWidth = width * CGFloat(min(Double(actual ?? 0) / ceiling, 1))
            let targetX = width * CGFloat(min(Double(target ?? 0) / ceiling, 1))

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.10))

                Capsule()
                    .fill(Theme.zoneColor(zone).gradient)
                    .frame(width: max(actualWidth, 4))
                    .animation(.easeOut(duration: 0.25), value: actualWidth)

                if target != nil {
                    Rectangle()
                        .fill(Color.white)
                        .frame(width: 3)
                        .offset(x: max(0, targetX - 1.5))
                        .shadow(color: .black.opacity(0.5), radius: 2)
                }
            }
        }
        .frame(height: 18 * Theme.scale)
    }
}

/// Small coloured dot plus label, used for connection status.
public struct StatusPill: View {
    let title: String
    let subtitle: String?
    let color: Color
    let systemImage: String

    public init(title: String, subtitle: String? = nil, color: Color, systemImage: String) {
        self.title = title
        self.subtitle = subtitle
        self.color = color
        self.systemImage = systemImage
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 13 * Theme.scale, weight: .semibold))
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 11 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color.white.opacity(0.08)))
    }
}
