import Foundation
import Testing
@testable import WattwerkCore

@Suite("Sekundenverlauf")
struct RideTrackTests {
    private func samples(_ count: Int, heartRate: Bool = true, speed: Bool = false) -> [RideSample] {
        (0..<count).map { index in
            RideSample(
                elapsed: TimeInterval(index),
                power: 150 + index,
                targetPower: 200,
                cadence: 90,
                heartRate: heartRate ? 140 + index : nil,
                speed: speed ? 31.5 : nil
            )
        }
    }

    @Test("Punkte und Spalten beschreiben dieselbe Fahrt")
    func roundTrip() throws {
        let original = samples(120, speed: true)
        let track = try #require(RideTrack(samples: original))

        #expect(track.sampleCount == 120)
        #expect(track.sampleIntervalSeconds == 1)
        #expect(track.startOffsetSeconds == 0)
        #expect(track.makeSamples() == original)
    }

    /// Der Unterschied zwischen „nicht gemessen“ und „null gemessen“ ist der
    /// Grund für die optionalen Spalten - eine Kurve auf Höhe null wäre eine
    /// Behauptung über einen Sensor, den es nie gab.
    @Test("Eine Größe ohne einen einzigen Wert bekommt keine Spalte")
    func dropsEmptyColumns() throws {
        let track = try #require(RideTrack(samples: samples(60, heartRate: false)))
        #expect(track.heartRate == nil)
        #expect(track.speed == nil)
        #expect(track.cadence?.count == 60)
    }

    @Test("Eine Lücke mitten in einer Spalte bleibt erhalten")
    func keepsGaps() throws {
        var points = samples(5)
        points[2].heartRate = nil
        let track = try #require(RideTrack(samples: points))

        #expect(track.heartRate?[2] == nil)
        #expect(track.makeSamples()[2].heartRate == nil)
        #expect(track.makeSamples()[3].heartRate == 143)
    }

    @Test("Ohne Punkte gibt es keine Spur")
    func emptyIsNil() {
        #expect(RideTrack(samples: []) == nil)
    }

    /// Spaltenweise statt als Liste von Punkten, weil der Unterschied genau der
    /// Grund für das Format ist: derselbe Inhalt, ein Bruchteil der Bytes.
    @Test("Spaltenweise ist deutlich kleiner als eine Liste von Punkten")
    func columnarIsSmaller() throws {
        let points = samples(3600, speed: true)
        let track = try #require(RideTrack(samples: points))

        let asObjects = try JSONEncoder().encode(points).count
        let asColumns = try JSONEncoder().encode(track).count
        #expect(asColumns < asObjects / 2)
    }

    @Test("Eine kürzere Spalte vom Server lässt die Kurve nicht abstürzen")
    func toleratesShortColumn() {
        // Kann passieren, wenn eine spätere Fassung des Servers eine Spalte
        // anders ausdünnt. Die fehlenden Sekunden haben eben keinen Wert.
        let track = RideTrack(
            sampleCount: 4,
            power: [100, 110, 120, 130],
            heartRate: [140, 141]
        )
        let points = track.makeSamples()
        #expect(points.count == 4)
        #expect(points[1].heartRate == 141)
        #expect(points[3].heartRate == nil)
    }
}

@MainActor
@Suite("Zwischenlager für Spuren")
struct RideTrackStoreTests {
    /// Eine Spur, die sich wie eine echte verhält: Watt schwanken um ein Ziel,
    /// der Puls driftet. Eine gleichförmige Reihe wäre kein brauchbarer Test -
    /// sie komprimiert auf fast nichts, und das Budget bliebe unberührt.
    private func track(_ count: Int, seed: UInt64 = 42) -> RideTrack {
        var state = seed
        func noise(_ range: Int) -> Int {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Int((state >> 33) % UInt64(range)) - range / 2
        }
        return RideTrack(
            sampleCount: count,
            power: (0..<count).map { 180 + ($0 / 300 % 3) * 40 + noise(40) },
            cadence: (0..<count).map { _ in 88 + noise(8) },
            heartRate: (0..<count).map { 130 + $0 / 200 + noise(6) }
        )
    }

    @Test("Eine abgelegte Spur kommt unverändert zurück")
    func storeAndRead() throws {
        let storage = InMemoryStorage()
        let store = RideTrackStore(storage: storage)
        let id = UUID()
        store.store(track(600), for: id)

        let reloaded = RideTrackStore(storage: storage)
        let found = try #require(reloaded.track(for: id))
        #expect(found.sampleCount == 600)
        #expect(found.power.count == 600)
        #expect(found.heartRate?.count == 600)
    }

    @Test("Über dem Budget weichen die ältesten Spuren")
    func enforcesBudget() {
        let store = RideTrackStore(storage: InMemoryStorage())
        // Eine Stunde im Sekundentakt ist komprimiert rund 14 kB; vierzig
        // Stunden ausstehender Fahrten sprengen das Budget sicher.
        let ids = (0..<40).map { _ in UUID() }
        for (index, id) in ids.enumerated() {
            store.store(track(3600, seed: UInt64(index) &* 7919 &+ 13), for: id)
        }

        #expect(store.storedIDs.count < ids.count)
        // Die jüngste überlebt - sie ist die, die als nächstes hochgeht.
        #expect(store.storedIDs.contains(ids.last!))
        #expect(!store.storedIDs.contains(ids.first!))
    }

    @Test("Spuren ohne Einheit werden weggeräumt")
    func prunes() {
        let store = RideTrackStore(storage: InMemoryStorage())
        let kept = UUID()
        let orphan = UUID()
        store.store(track(60), for: kept)
        store.store(track(60), for: orphan)

        store.pruneTracks(keeping: [kept])
        #expect(store.track(for: kept) != nil)
        #expect(store.track(for: orphan) == nil)
    }
}
