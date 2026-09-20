import Foundation
import Testing
@testable import WattwerkBluetooth
@testable import WattwerkCore

/// End to end through the real pieces: the ride engine commands the simulated
/// trainer, the trainer answers with readings, and the engine records them.
/// No Bluetooth hardware, no waiting in real time.
@MainActor
@Suite("Fahrt mit Simulator")
struct RideIntegrationTests {
    private let start = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeRide() -> (WorkoutEngine, SimulatedTrainer) {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        let trainer = SimulatedTrainer()
        trainer.onReading = { [weak engine] reading in engine?.ingest(reading) }
        engine.trainerControl = trainer
        return (engine, trainer)
    }

    /// One simulated second: the trainer produces a reading, then the clock moves.
    private func ride(_ engine: WorkoutEngine, _ trainer: SimulatedTrainer, seconds: Int, from origin: Date) async -> Date {
        var now = origin
        for _ in 0..<seconds {
            now = now.addingTimeInterval(1)
            trainer.step()
            engine.tick(at: now)
            // Let the control point commands that the tick queued actually run.
            await Task.yield()
        }
        return now
    }

    @Test("Der Simulator folgt der Zielvorgabe")
    func followsTarget() async {
        let (engine, trainer) = makeRide()
        engine.start(
            Workout(name: "Konstant", segments: [.steady(300, percentFTP: 1.0)]),
            at: start
        )
        _ = await ride(engine, trainer, seconds: 60, from: start)

        #expect(trainer.targetWatts == 200)
        // Der simulierte Fahrer schwankt, trifft das Ziel aber im Mittel.
        #expect(abs(engine.stats.averagePower - 200) < 40)
        #expect(engine.live.cadence ?? 0 > 60)
        #expect(engine.live.heartRate ?? 0 > 80)
    }

    @Test("Ein Segmentwechsel zieht den Trainer mit")
    func followsSegmentChange() async {
        let (engine, trainer) = makeRide()
        engine.start(
            Workout(
                name: "Wechsel",
                segments: [
                    .steady(30, percentFTP: 0.5),
                    .steady(60, percentFTP: 1.25),
                ]
            ),
            at: start
        )
        _ = await ride(engine, trainer, seconds: 29, from: start)
        #expect(trainer.targetWatts == 100)

        _ = await ride(engine, trainer, seconds: 20, from: start.addingTimeInterval(29))
        #expect(trainer.targetWatts == 250)
        #expect(engine.position?.segmentIndex == 1)
    }

    @Test("Eine vollständige Einheit erzeugt eine plausible Auswertung")
    func producesRecord() async throws {
        let (engine, trainer) = makeRide()
        let workout = Workout(
            name: "Kurzeinheit",
            segments: [
                .steady(60, percentFTP: 0.6),
                .steady(60, percentFTP: 1.1),
                .steady(60, percentFTP: 0.5),
            ]
        )
        engine.start(workout, at: start)
        _ = await ride(engine, trainer, seconds: 181, from: start)

        #expect(engine.state == .finished)
        let record = try #require(engine.lastRecord)
        #expect(record.completed)
        #expect(record.duration == 180)
        #expect(record.samples.count >= 175)
        #expect(record.averagePower > 100)
        #expect(record.normalizedPower >= record.averagePower - 5)
        #expect(record.kilojoules > 0)
        #expect(record.averageHeartRate ?? 0 > 80)
        #expect(!record.timeInZone.isEmpty)
        // Die Summe der Zonenzeiten entspricht der Zahl der Messpunkte.
        let zoneSeconds = record.timeInZone.reduce(0) { $0 + $1.seconds }
        #expect(zoneSeconds == Double(record.samples.count))
    }

    @Test("Freie Blöcke geben den Trainer frei")
    func freeRideReleasesTrainer() async {
        let (engine, trainer) = makeRide()
        engine.start(
            Workout(name: "Frei", segments: [.steady(30, percentFTP: 1.5), .free(60)]),
            at: start
        )
        _ = await ride(engine, trainer, seconds: 10, from: start)
        #expect(trainer.targetWatts == 300)

        _ = await ride(engine, trainer, seconds: 25, from: start.addingTimeInterval(10))
        #expect(engine.commandedWatts == nil)
        // Nach der Freigabe rollt der Simulator im Grundlagenbereich weiter.
        #expect(trainer.targetWatts == 130)
    }
}
