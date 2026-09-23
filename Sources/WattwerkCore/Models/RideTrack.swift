import Foundation

/// Der Sekundenverlauf einer Fahrt, spaltenweise.
///
/// Dasselbe wie `[RideSample]`, nur anders herum gelegt: ein Feld je
/// Messgröße statt ein Objekt je Sekunde. Das ist die Form, in der die Spur
/// über die Leitung geht und auf dem Apple TV zwischengelagert wird - eine
/// Stunde Fahrt ist so rund ein Drittel so groß, weil die Feldnamen einmal
/// vorkommen statt dreitausendsechshundertmal.
///
/// Eine Spalte, die während der ganzen Fahrt nichts gemessen hat, fehlt ganz.
/// Ein `nil` innerhalb einer vorhandenen Spalte heißt dagegen: hier gab es
/// keinen Wert, etwa weil der Pulsgurt kurz weg war. Die beiden Aussagen
/// auseinanderzuhalten ist der Grund, warum die Spalten optional sind und
/// nicht einfach mit Nullen aufgefüllt werden.
public struct RideTrack: Codable, Hashable, Sendable {
    /// Abstand zweier Punkte. Die Engine schreibt jede Sekunde einen.
    public var sampleIntervalSeconds: Int
    public var sampleCount: Int
    /// Sekunde des ersten Punktes, gemessen ab Start der Einheit.
    public var startOffsetSeconds: Int
    public var power: [Int]
    public var targetPower: [Int?]?
    public var cadence: [Int?]?
    public var heartRate: [Int?]?
    public var speed: [Double?]?

    public init(
        sampleIntervalSeconds: Int = 1,
        sampleCount: Int,
        startOffsetSeconds: Int = 0,
        power: [Int],
        targetPower: [Int?]? = nil,
        cadence: [Int?]? = nil,
        heartRate: [Int?]? = nil,
        speed: [Double?]? = nil
    ) {
        self.sampleIntervalSeconds = sampleIntervalSeconds
        self.sampleCount = sampleCount
        self.startOffsetSeconds = startOffsetSeconds
        self.power = power
        self.targetPower = targetPower
        self.cadence = cadence
        self.heartRate = heartRate
        self.speed = speed
    }

    /// `nil`, wenn es nichts aufzuzeichnen gab.
    public init?(samples: [RideSample]) {
        guard let first = samples.first else { return nil }

        self.init(
            sampleIntervalSeconds: 1,
            sampleCount: samples.count,
            startOffsetSeconds: Int(first.elapsed.rounded()),
            power: samples.map(\.power),
            targetPower: Self.column(samples.map(\.targetPower)),
            cadence: Self.column(samples.map(\.cadence)),
            heartRate: Self.column(samples.map(\.heartRate)),
            speed: Self.column(samples.map(\.speed))
        )
    }

    /// Zurück in die Form, die Diagramm und CSV-Export erwarten.
    public func makeSamples() -> [RideSample] {
        (0..<power.count).map { index in
            RideSample(
                elapsed: TimeInterval(startOffsetSeconds + index * max(1, sampleIntervalSeconds)),
                power: power[index],
                targetPower: targetPower?[safe: index] ?? nil,
                cadence: cadence?[safe: index] ?? nil,
                heartRate: heartRate?[safe: index] ?? nil,
                speed: speed?[safe: index] ?? nil
            )
        }
    }

    /// Lässt eine Spalte weg, in der kein einziger Wert steht.
    private static func column<Value>(_ values: [Value?]) -> [Value?]? {
        values.contains(where: { $0 != nil }) ? values : nil
    }
}

private extension Array {
    /// Eine Spalte vom Server kann kürzer sein als `power`. Das ist kein Grund
    /// für einen Absturz - die fehlenden Sekunden haben eben keinen Wert.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
