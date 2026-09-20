import Foundation
import Testing
@testable import WattwerkCore

@Suite("Leistungsmathematik")
struct PowerMathTests {
    @Test("Mittelwert rundet kaufmännisch")
    func average() {
        #expect(PowerMath.average([100, 200, 300]) == 200)
        #expect(PowerMath.average([]) == 0)
        #expect(PowerMath.average([100, 101]) == 101)
    }

    @Test("Bei konstanter Leistung entspricht NP dem Mittelwert")
    func normalizedPowerConstant() {
        let steady = [Int](repeating: 200, count: 600)
        #expect(PowerMath.normalizedPower(steady) == 200)
    }

    @Test("Zu kurze Aufzeichnungen fallen auf den Mittelwert zurück")
    func normalizedPowerShort() {
        let short = [Int](repeating: 250, count: 10)
        #expect(PowerMath.normalizedPower(short) == 250)
    }

    @Test("Schwankende Leistung hebt NP über den Mittelwert")
    func normalizedPowerVariable() {
        // Abwechselnd eine Minute 300 W und eine Minute 100 W: Mittelwert 200 W,
        // NP deutlich darüber, weil die harten Phasen vierfach gewichtet werden.
        var watts: [Int] = []
        for block in 0..<20 {
            watts.append(contentsOf: [Int](repeating: block.isMultiple(of: 2) ? 300 : 100, count: 60))
        }
        let average = PowerMath.average(watts)
        let normalized = PowerMath.normalizedPower(watts)
        #expect(average == 200)
        #expect(normalized > average)
        #expect(normalized < 300)
    }

    @Test("Eine Stunde an der Schwelle ergibt 100 TSS")
    func trainingStress() {
        let tss = PowerMath.trainingStressScore(duration: 3600, normalizedPower: 250, ftp: 250)
        #expect(tss == 100)
        let half = PowerMath.trainingStressScore(duration: 1800, normalizedPower: 250, ftp: 250)
        #expect(half == 50)
        #expect(PowerMath.trainingStressScore(duration: 3600, normalizedPower: 200, ftp: 0) == 0)
    }

    @Test("Arbeit in Kilojoule")
    func kilojoules() {
        #expect(PowerMath.kilojoules([Int](repeating: 200, count: 3600)) == 720)
        #expect(PowerMath.kilojoules([]) == 0)
    }

    @Test("FTP-Schätzungen")
    func ftpEstimates() {
        #expect(PowerMath.estimatedFTP(fromBestTwentyMinutes: 300) == 285)
        #expect(PowerMath.estimatedFTP(fromRampBestMinute: 400) == 300)
    }

    @Test("Zeitformate")
    func formatting() {
        #expect(Formatting.clock(0) == "00:00")
        #expect(Formatting.clock(65) == "01:05")
        #expect(Formatting.clock(3725) == "1:02:05")
        #expect(Formatting.clock(-10) == "00:00")
        #expect(Formatting.compactDuration(45) == "45 s")
        #expect(Formatting.compactDuration(600) == "10 min")
        #expect(Formatting.compactDuration(4500) == "1:15 h")
    }
}
