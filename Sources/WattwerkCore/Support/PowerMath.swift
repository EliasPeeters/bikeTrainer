import Foundation

/// The standard cycling maths, kept pure so the tests can pin it down.
public enum PowerMath {
    public static func average(_ values: [Int]) -> Int {
        guard !values.isEmpty else { return 0 }
        return Int((Double(values.reduce(0, +)) / Double(values.count)).rounded())
    }

    /// Normalized power: 30 second rolling average, raised to the fourth power,
    /// averaged, then the fourth root. Falls back to the plain average for rides
    /// shorter than the rolling window.
    public static func normalizedPower(_ watts: [Int], window: Int = 30) -> Int {
        guard watts.count >= window, window > 0 else { return average(watts) }
        var rollingSum = 0
        var fourthPowerSum = 0.0
        var count = 0
        for (index, value) in watts.enumerated() {
            rollingSum += value
            if index >= window {
                rollingSum -= watts[index - window]
            }
            if index >= window - 1 {
                let rollingAverage = Double(rollingSum) / Double(window)
                fourthPowerSum += pow(rollingAverage, 4)
                count += 1
            }
        }
        guard count > 0 else { return average(watts) }
        return Int(pow(fourthPowerSum / Double(count), 0.25).rounded())
    }

    public static func intensityFactor(normalizedPower: Int, ftp: Int) -> Double {
        guard ftp > 0 else { return 0 }
        return Double(normalizedPower) / Double(ftp)
    }

    public static func trainingStressScore(
        duration: TimeInterval,
        normalizedPower: Int,
        ftp: Int
    ) -> Int {
        guard ftp > 0, duration > 0 else { return 0 }
        let factor = intensityFactor(normalizedPower: normalizedPower, ftp: ftp)
        let tss = (duration * Double(normalizedPower) * factor) / (Double(ftp) * 3600) * 100
        return Int(tss.rounded())
    }

    /// Mechanical work in kilojoules. One watt for one second is one joule.
    public static func kilojoules(_ watts: [Int], sampleInterval: TimeInterval = 1) -> Int {
        let joules = Double(watts.reduce(0, +)) * sampleInterval
        return Int((joules / 1000).rounded())
    }

    /// The classic 20-minute-test heuristic, also used for the ramp test result.
    public static func estimatedFTP(fromBestTwentyMinutes watts: Int) -> Int {
        Int((Double(watts) * 0.95).rounded())
    }

    /// Coggan's ramp-test estimate: 75 % of the best one-minute power.
    public static func estimatedFTP(fromRampBestMinute watts: Int) -> Int {
        Int((Double(watts) * 0.75).rounded())
    }
}
