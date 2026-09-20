import Foundation

/// How hard a segment wants the rider to push.
///
/// Targets are stored relative to FTP by default so that a workout keeps its
/// meaning when the rider gets fitter. Absolute watts stay available for people
/// who think in numbers rather than percentages.
public enum PowerTarget: Hashable, Sendable, Codable {
    /// A fixed wattage, independent of the rider profile.
    case watts(Int)
    /// A fraction of FTP. `1.0` means "exactly threshold".
    case percentFTP(Double)
    /// No ERG target - the trainer stays in whatever resistance mode it is in
    /// and the rider decides. Used for free rides and open cooldowns.
    case free

    /// The wattage the trainer should be commanded to hold, or `nil` for free riding.
    public func resolvedWatts(ftp: Int) -> Int? {
        switch self {
        case let .watts(watts):
            return max(0, watts)
        case let .percentFTP(fraction):
            return max(0, Int((Double(ftp) * fraction).rounded()))
        case .free:
            return nil
        }
    }

    /// Intensity relative to FTP, used for zone colours and chart heights.
    public func fractionOfFTP(ftp: Int) -> Double? {
        guard ftp > 0, let watts = resolvedWatts(ftp: ftp) else { return nil }
        return Double(watts) / Double(ftp)
    }

    public var isFree: Bool {
        if case .free = self { return true }
        return false
    }
}

extension PowerTarget {
    /// Linear interpolation between two targets, used by ramp segments.
    /// A ramp that touches `.free` on either end stays free.
    public static func interpolate(
        from start: PowerTarget,
        to end: PowerTarget,
        progress: Double,
        ftp: Int
    ) -> PowerTarget {
        guard let a = start.resolvedWatts(ftp: ftp), let b = end.resolvedWatts(ftp: ftp) else {
            return .free
        }
        let clamped = min(max(progress, 0), 1)
        return .watts(Int((Double(a) + (Double(b) - Double(a)) * clamped).rounded()))
    }
}
