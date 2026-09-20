import Foundation
import Testing
@testable import WattwerkCore

/// Records what the engine commands, so the tests can check ERG behaviour.
@MainActor
final class MockTrainer: TrainerControl {
    let displayName = "Mock"
    var supportsTargetPower = true
    var supportedPowerRange: ClosedRange<Int>?
    private(set) var controlRequests = 0
    private(set) var releases = 0
    private(set) var targets: [Int] = []

    func requestControl() async throws { controlRequests += 1 }
    func setTargetPower(_ watts: Int) async throws { targets.append(watts) }
    func releaseControl() async throws { releases += 1 }
}

@MainActor
@Suite("Ride-Engine")
struct WorkoutEngineTests {
    private let start = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeWorkout() -> Workout {
        Workout(
            name: "Test",
            segments: [
                .steady(60, percentFTP: 1.0, title: "Block A"),
                .steady(60, percentFTP: 0.5, title: "Block B"),
            ]
        )
    }

    /// The engine clamps each tick to two seconds, so time has to pass in
    /// realistic steps rather than one big jump.
    private func advance(_ engine: WorkoutEngine, seconds: Int, from origin: Date) -> Date {
        var now = origin
        for _ in 0..<seconds {
            now = now.addingTimeInterval(1)
            engine.ingest(TrainerReading(power: 190, cadence: 90, timestamp: now))
            engine.tick(at: now)
        }
        return now
    }

    @Test("Start setzt das erste Ziel")
    func startsWithFirstTarget() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        #expect(engine.state == .running)
        #expect(engine.position?.segmentIndex == 0)
        #expect(engine.plannedWatts == 200)
        #expect(engine.commandedWatts == 200)
        #expect(engine.totalDuration == 120)
    }

    @Test("Der Segmentwechsel ändert das Ziel")
    func advancesThroughSegments() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        let now = advance(engine, seconds: 61, from: start)
        #expect(engine.position?.segmentIndex == 1)
        #expect(engine.commandedWatts == 100)
        #expect(engine.elapsed == 61)
        _ = now
    }

    @Test("Am Ende entsteht eine Aufzeichnung")
    func finishesAndRecords() throws {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        _ = advance(engine, seconds: 121, from: start)
        #expect(engine.state == .finished)
        let record = try #require(engine.lastRecord)
        #expect(record.completed)
        #expect(record.duration == 120)
        #expect(record.averagePower == 190)
        #expect(record.workoutName == "Test")
        #expect(record.samples.count >= 115)
    }

    @Test("Der Intensitätsregler skaliert das Ziel und bleibt im Rahmen")
    func intensityBias() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        engine.setIntensityBias(1.1)
        #expect(engine.commandedWatts == 220)
        engine.setIntensityBias(0.9)
        #expect(engine.commandedWatts == 180)
        engine.setIntensityBias(5.0)
        #expect(engine.intensityBias == 1.5)
        engine.setIntensityBias(0.1)
        #expect(engine.intensityBias == 0.5)
    }

    @Test("Blöcke lassen sich überspringen und wiederholen")
    func skipping() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        _ = advance(engine, seconds: 10, from: start)

        engine.skipForward()
        #expect(engine.position?.segmentIndex == 1)
        #expect(engine.elapsed == 60)

        // Mitten im Block springt "zurück" an dessen Anfang.
        _ = advance(engine, seconds: 20, from: start.addingTimeInterval(60))
        engine.skipBackward()
        #expect(engine.position?.segmentIndex == 1)
        #expect(engine.elapsed == 60)

        // Direkt am Anfang springt "zurück" in den vorherigen Block.
        engine.skipBackward()
        #expect(engine.position?.segmentIndex == 0)
        #expect(engine.elapsed == 0)
    }

    @Test("Über das Ende hinaus zu springen beendet die Einheit")
    func skipPastEndFinishes() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        engine.skipForward()
        engine.skipForward()
        #expect(engine.state == .finished)
    }

    @Test("Pausieren hält die Uhr an")
    func pauseStopsTheClock() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        var now = advance(engine, seconds: 10, from: start)
        engine.pause()
        #expect(engine.state == .paused)

        // Ticks während der Pause werden ignoriert.
        now = now.addingTimeInterval(1)
        engine.tick(at: now)
        #expect(engine.elapsed == 10)

        engine.resume(at: now)
        #expect(engine.state == .running)
        _ = advance(engine, seconds: 5, from: now)
        #expect(engine.elapsed == 15)
    }

    @Test("Ein Zeitsprung wird gedeckelt, damit ein Schlaf nicht das Workout überspringt")
    func clampsLargeTimeJumps() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        engine.tick(at: start.addingTimeInterval(600))
        #expect(engine.elapsed == 2)
    }

    @Test("Freie Blöcke geben den Trainer frei")
    func freeSegmentsReleaseControl() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        let workout = Workout(name: "Frei", segments: [.free(60), .steady(60, percentFTP: 0.8)])
        engine.start(workout, at: start)
        #expect(engine.commandedWatts == nil)
        _ = advance(engine, seconds: 61, from: start)
        #expect(engine.commandedWatts == 160)
    }

    @Test("Ziele gehen an den Trainer und werden auf dessen Bereich begrenzt")
    func sendsTargetsToTrainer() async throws {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        let trainer = MockTrainer()
        trainer.supportedPowerRange = 50...150
        engine.trainerControl = trainer
        engine.start(makeWorkout(), at: start)

        // Die Kommandos laufen in eigenen Tasks - kurz die Schleife abgeben.
        for _ in 0..<10 where trainer.targets.isEmpty {
            await Task.yield()
        }
        #expect(engine.commandedWatts == 150)
        #expect(trainer.targets.first == 150)
        #expect(trainer.controlRequests >= 1)
    }

    @Test("Während einer Rampe wird der Trainer nicht mit Befehlen überflutet")
    func throttlesTargetsDuringRamps() async {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        let trainer = MockTrainer()
        engine.trainerControl = trainer
        engine.start(
            Workout(name: "Rampe", segments: [.ramp(600, fromPercentFTP: 0.4, toPercentFTP: 1.4)]),
            at: start
        )

        // Vier Sekunden in Vierteltakten - so tickt die Engine auch in echt.
        var now = start
        for _ in 0..<16 {
            now = now.addingTimeInterval(0.25)
            engine.tick(at: now)
        }
        for _ in 0..<20 { await Task.yield() }

        // Das Ziel steigt bei jedem Tick, gesendet wird höchstens einmal pro Sekunde.
        #expect(trainer.targets.count <= 6)
        #expect(trainer.targets.count >= 2)
        #expect(engine.commandedWatts ?? 0 > 80)
    }

    @Test("Ohne steuerbaren Trainer wird das Ziel nur angezeigt")
    func readOnlyTrainer() async {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        let trainer = MockTrainer()
        trainer.supportsTargetPower = false
        engine.trainerControl = trainer
        engine.start(makeWorkout(), at: start)
        for _ in 0..<5 { await Task.yield() }
        #expect(engine.commandedWatts == 200)
        #expect(trainer.targets.isEmpty)
    }

    @Test("Stehende Sensoren werden nach kurzer Zeit auf null gesetzt")
    func staleReadingsFallToZero() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        engine.ingest(TrainerReading(power: 240, cadence: 95, timestamp: start))
        #expect(engine.live.power == 240)

        // Zehn Sekunden ohne neue Werte: der Trainer schweigt, also steht das Rad.
        var now = start
        for _ in 0..<10 {
            now = now.addingTimeInterval(1)
            engine.tick(at: now)
        }
        #expect(engine.live.power == 0)
        #expect(engine.live.cadence == 0)
    }

    @Test("Abbrechen speichert die tatsächlich gefahrene Dauer")
    func stopKeepsPartialRide() {
        let engine = WorkoutEngine(ftp: 200, usesRealClock: false)
        engine.start(makeWorkout(), at: start)
        _ = advance(engine, seconds: 30, from: start)
        engine.stop()
        #expect(engine.state == .finished)
        #expect(engine.lastRecord?.completed == false)
        #expect(engine.lastRecord?.duration == 30)
    }
}
