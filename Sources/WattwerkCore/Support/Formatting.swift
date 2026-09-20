import Foundation

/// Small, allocation-free formatters. Deliberately not `DateComponentsFormatter`:
/// these run several times per second on the ride screen.
public enum Formatting {
    /// `01:23` or `1:02:03`
    public static func clock(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval.rounded()))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }

    /// `45 min` / `1:15 h` - for lists and segment labels.
    public static func compactDuration(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval.rounded()))
        if total < 60 { return "\(total) s" }
        let minutes = total / 60
        let seconds = total % 60
        if minutes < 60 {
            return seconds == 0 ? "\(minutes) min" : String(format: "%d:%02d min", minutes, seconds)
        }
        let hours = minutes / 60
        let remainder = minutes % 60
        return String(format: "%d:%02d h", hours, remainder)
    }

    public static func watts(_ value: Int?) -> String {
        guard let value else { return "--" }
        return "\(value)"
    }

    public static func percent(_ fraction: Double) -> String {
        "\(Int((fraction * 100).rounded())) %"
    }

    public static func decimal(_ value: Double, places: Int = 1) -> String {
        String(format: "%.\(places)f", value)
    }
}
