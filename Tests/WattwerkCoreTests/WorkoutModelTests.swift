import Foundation
import Testing
@testable import WattwerkCore

@Suite("Leistungsziele")
struct PowerTargetTests {
    @Test("Prozentziele rechnen gegen die FTP")
    func percentResolves() {
        #expect(PowerTarget.percentFTP(0.9).resolvedWatts(ftp: 200) == 180)
        #expect(PowerTarget.percentFTP(1.2).resolvedWatts(ftp: 250) == 300)
        #expect(PowerTarget.watts(175).resolvedWatts(ftp: 200) == 175)
        #expect(PowerTarget.free.resolvedWatts(ftp: 200) == nil)
    }

    @Test("Rampen interpolieren linear")
    func rampInterpolation() {
        let start = PowerTarget.percentFTP(0.5)
        let end = PowerTarget.percentFTP(1.0)
        let middle = PowerTarget.interpolate(from: start, to: end, progress: 0.5, ftp: 200)
        #expect(middle.resolvedWatts(ftp: 200) == 150)

        let clampedLow = PowerTarget.interpolate(from: start, to: end, progress: -1, ftp: 200)
        #expect(clampedLow.resolvedWatts(ftp: 200) == 100)
        let clampedHigh = PowerTarget.interpolate(from: start, to: end, progress: 5, ftp: 200)
        #expect(clampedHigh.resolvedWatts(ftp: 200) == 200)
    }

    @Test("Eine Rampe, die frei endet, bleibt frei")
    func rampWithFreeStaysFree() {
        let result = PowerTarget.interpolate(from: .percentFTP(0.5), to: .free, progress: 0.5, ftp: 200)
        #expect(result.isFree)
    }

    @Test("Zonen nach Coggan")
    func zones() {
        #expect(PowerZone(watts: 100, ftp: 200) == .recovery)
        #expect(PowerZone(watts: 140, ftp: 200) == .endurance)
        #expect(PowerZone(watts: 170, ftp: 200) == .tempo)
        #expect(PowerZone(watts: 200, ftp: 200) == .threshold)
        #expect(PowerZone(watts: 230, ftp: 200) == .vo2max)
        #expect(PowerZone(watts: 280, ftp: 200) == .anaerobic)
        #expect(PowerZone(watts: 400, ftp: 200) == .neuromuscular)
    }
}

@Suite("Workout")
struct WorkoutTests {
    @Test("Dauer ist die Summe der Segmente")
    func duration() {
        let workout = Workout(
            name: "Test",
            segments: [.steady(300, percentFTP: 0.6), .steady(120, percentFTP: 1.0)]
        )
        #expect(workout.duration == 420)
    }

    @Test("Belastungswerte sind plausibel")
    func stress() {
        // Eine Stunde exakt an der Schwelle ist per Definition 100 TSS.
        let hourAtFTP = Workout(name: "FTP", segments: [.steady(3600, percentFTP: 1.0)])
        #expect(hourAtFTP.plannedTSS(ftp: 200) == 100)
        #expect(abs(hourAtFTP.intensityFactor(ftp: 200) - 1.0) < 0.001)

        let easy = Workout(name: "Locker", segments: [.steady(3600, percentFTP: 0.5)])
        #expect(easy.plannedTSS(ftp: 200) == 25)
    }

    @Test("Das Profil liefert einen Block je Segment in zeitlicher Reihenfolge")
    func profile() {
        let workout = Workout(
            name: "Test",
            segments: [
                .steady(60, percentFTP: 0.5),
                .ramp(120, fromPercentFTP: 0.6, toPercentFTP: 1.0),
                .free(30),
            ]
        )
        let blocks = workout.profile(ftp: 200)
        #expect(blocks.count == 3)
        #expect(blocks[0].start == 0)
        #expect(blocks[1].start == 60)
        #expect(blocks[1].startWatts == 120)
        #expect(blocks[1].endWatts == 200)
        #expect(blocks[2].startWatts == nil)
        #expect(workout.peakWatts(ftp: 200) == 200)
    }

    @Test("Duplikate bekommen neue Kennungen und sind bearbeitbar")
    func duplication() {
        let original = BuiltInWorkouts.sweetSpot3x12
        let copy = original.duplicated()
        #expect(copy.id != original.id)
        #expect(copy.isBuiltIn == false)
        #expect(copy.segments.count == original.segments.count)
        #expect(Set(copy.segments.map(\.id)).isDisjoint(with: Set(original.segments.map(\.id))))
    }

    @Test("Alle mitgelieferten Programme sind schlüssig")
    func builtInsAreSane() {
        #expect(BuiltInWorkouts.all.count >= 10)
        for workout in BuiltInWorkouts.all {
            #expect(!workout.name.isEmpty)
            #expect(workout.isBuiltIn)
            #expect(workout.duration > 0)
            #expect(!workout.segments.isEmpty)
            for segment in workout.segments {
                #expect(segment.duration >= 1)
            }
        }
        // Stabile Kennungen: zwei Zugriffe liefern dieselben IDs.
        #expect(BuiltInWorkouts.all.map(\.id) == BuiltInWorkouts.all.map(\.id))
        #expect(Set(BuiltInWorkouts.all.map(\.id)).count == BuiltInWorkouts.all.count)
    }

    @Test("Workouts überleben eine Runde durch JSON")
    func codableRoundTrip() throws {
        let original = BuiltInWorkouts.pyramide
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Workout.self, from: data)
        #expect(decoded == original)
    }
}

@Suite("Zeitachse")
struct WorkoutTimelineTests {
    private var workout: Workout {
        Workout(
            name: "Test",
            segments: [
                .steady(60, percentFTP: 0.5),
                .ramp(100, fromPercentFTP: 0.5, toPercentFTP: 1.0),
                .steady(40, percentFTP: 0.8),
            ]
        )
    }

    @Test("Positionen fallen in das richtige Segment")
    func positions() {
        let timeline = WorkoutTimeline(workout: workout, ftp: 200)
        #expect(timeline.duration == 200)
        #expect(timeline.position(at: 0)?.segmentIndex == 0)
        #expect(timeline.position(at: 59.9)?.segmentIndex == 0)
        // Genau auf der Grenze beginnt bereits das nächste Segment.
        #expect(timeline.position(at: 60)?.segmentIndex == 1)
        #expect(timeline.position(at: 159)?.segmentIndex == 1)
        #expect(timeline.position(at: 160)?.segmentIndex == 2)
        #expect(timeline.position(at: 199.9)?.segmentIndex == 2)
        #expect(timeline.position(at: 200) == nil)
        #expect(timeline.position(at: 500) == nil)
    }

    @Test("Rampen liefern den interpolierten Zielwert")
    func rampTarget() {
        let timeline = WorkoutTimeline(workout: workout, ftp: 200)
        let middle = timeline.position(at: 110)
        #expect(middle?.target.resolvedWatts(ftp: 200) == 150)
        #expect(middle?.segmentElapsed == 50)
        #expect(middle?.segmentRemaining == 50)
    }

    @Test("Die Segmentsuche funktioniert auch bei sehr vielen Blöcken")
    func manySegments() {
        let segments = (0..<500).map { index in
            WorkoutSegment.steady(10, percentFTP: index.isMultiple(of: 2) ? 1.2 : 0.4)
        }
        let timeline = WorkoutTimeline(workout: Workout(name: "Viele", segments: segments), ftp: 200)
        #expect(timeline.position(at: 0)?.segmentIndex == 0)
        #expect(timeline.position(at: 2495)?.segmentIndex == 249)
        #expect(timeline.position(at: 4999)?.segmentIndex == 499)
        #expect(timeline.position(at: 5000) == nil)
    }

    @Test("Leere Workouts liefern keine Position")
    func emptyWorkout() {
        let timeline = WorkoutTimeline(workout: Workout(name: "Leer", segments: []), ftp: 200)
        #expect(timeline.duration == 0)
        #expect(timeline.position(at: 0) == nil)
    }
}
