import SwiftUI
import WattwerkCore

/// One place for every colour and metric so the Mac and the TV look like the
/// same app at very different viewing distances.
public enum Theme {
    public static let background = Color(red: 0.05, green: 0.06, blue: 0.08)
    public static let surface = Color(red: 0.10, green: 0.11, blue: 0.14)
    public static let surfaceRaised = Color(red: 0.14, green: 0.15, blue: 0.19)
    public static let accent = Color(red: 0.98, green: 0.72, blue: 0.11)
    public static let positive = Color(red: 0.30, green: 0.80, blue: 0.48)
    public static let negative = Color(red: 0.93, green: 0.35, blue: 0.33)
    public static let heartRate = Color(red: 0.95, green: 0.30, blue: 0.40)
    public static let cadence = Color(red: 0.40, green: 0.72, blue: 0.98)

    public static let cornerRadius: CGFloat = 16

    /// Everything scales up on the TV, which is watched from three metres away.
    public static var scale: CGFloat {
        #if os(tvOS)
        return 1.6
        #else
        return 1.0
        #endif
    }

    public static func zoneColor(_ zone: PowerZone?) -> Color {
        guard let zone else { return Color.gray.opacity(0.5) }
        switch zone {
        case .recovery: return Color(red: 0.45, green: 0.50, blue: 0.58)
        case .endurance: return Color(red: 0.33, green: 0.62, blue: 0.93)
        case .tempo: return Color(red: 0.24, green: 0.76, blue: 0.55)
        case .threshold: return Color(red: 0.95, green: 0.78, blue: 0.22)
        case .vo2max: return Color(red: 0.97, green: 0.55, blue: 0.18)
        case .anaerobic: return Color(red: 0.92, green: 0.31, blue: 0.27)
        case .neuromuscular: return Color(red: 0.72, green: 0.35, blue: 0.92)
        }
    }

    /// Green when on target, red when too far off. Used by the power readout.
    public static func deviationColor(_ deviation: Double?) -> Color {
        guard let deviation else { return .white }
        let magnitude = abs(deviation)
        if magnitude < 0.04 { return positive }
        if magnitude < 0.10 { return accent }
        return negative
    }
}

extension View {
    /// The standard card used across both platforms.
    public func cardBackground(_ color: Color = Theme.surface) -> some View {
        background(
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                .fill(color)
        )
    }
}
