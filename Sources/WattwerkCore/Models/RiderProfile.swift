import Foundation

/// Everything the app needs to know about the person on the bike.
public struct RiderProfile: Hashable, Sendable, Codable {
    public var name: String
    /// Functional threshold power in watts - the reference for every relative target.
    public var ftp: Int
    public var maxHeartRate: Int
    public var restingHeartRate: Int
    public var weightKg: Double
    public var ftpUpdatedAt: Date

    public init(
        name: String = "Fahrer",
        ftp: Int = 200,
        maxHeartRate: Int = 185,
        restingHeartRate: Int = 55,
        weightKg: Double = 75,
        ftpUpdatedAt: Date = Date()
    ) {
        self.name = name
        self.ftp = max(50, ftp)
        self.maxHeartRate = maxHeartRate
        self.restingHeartRate = restingHeartRate
        self.weightKg = weightKg
        self.ftpUpdatedAt = ftpUpdatedAt
    }

    public static let `default` = RiderProfile()

    public var wattsPerKilo: Double {
        weightKg > 0 ? Double(ftp) / weightKg : 0
    }

    /// Heart rate as a percentage of the working range (Karvonen).
    public func heartRateReserveFraction(_ bpm: Int) -> Double {
        let range = Double(maxHeartRate - restingHeartRate)
        guard range > 0 else { return 0 }
        return min(max(Double(bpm - restingHeartRate) / range, 0), 1)
    }
}
