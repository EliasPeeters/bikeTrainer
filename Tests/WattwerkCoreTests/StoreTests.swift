import Foundation
import Testing
@testable import WattwerkCore

@MainActor
@Suite("Bibliothek und Verlauf")
struct StoreTests {
    @Test("Eigene Programme werden gespeichert und wieder geladen")
    func persistsUserWorkouts() {
        let storage = InMemoryStorage()
        let library = WorkoutLibrary(storage: storage)
        let workout = Workout(name: "Eigenes", segments: [.steady(600, percentFTP: 0.8)])
        library.add(workout)

        let reloaded = WorkoutLibrary(storage: storage)
        #expect(reloaded.userWorkouts.count == 1)
        #expect(reloaded.userWorkouts.first?.name == "Eigenes")
        #expect(reloaded.allWorkouts.count == 1 + BuiltInWorkouts.all.count)
    }

    @Test("Das Bearbeiten eines mitgelieferten Programms legt eine Kopie an")
    func editingBuiltInForks() {
        let library = WorkoutLibrary(storage: InMemoryStorage())
        var builtIn = BuiltInWorkouts.tabata
        builtIn.name = "Tabata hart"
        let saved = library.save(builtIn)

        #expect(saved.isBuiltIn == false)
        #expect(saved.id != BuiltInWorkouts.tabata.id)
        #expect(library.userWorkouts.count == 1)
        // Der Katalog bleibt unangetastet.
        #expect(library.builtInWorkouts.contains { $0.id == BuiltInWorkouts.tabata.id })
    }

    @Test("Eigene Programme lassen sich aktualisieren und löschen")
    func updateAndDelete() {
        let library = WorkoutLibrary(storage: InMemoryStorage())
        var workout = Workout(name: "Eigenes", segments: [.steady(600, percentFTP: 0.8)])
        library.add(workout)
        workout = library.userWorkouts[0]
        workout.name = "Umbenannt"
        library.save(workout)
        #expect(library.userWorkouts.count == 1)
        #expect(library.userWorkouts[0].name == "Umbenannt")

        library.delete(id: workout.id)
        #expect(library.userWorkouts.isEmpty)
    }

    @Test("Import und Export gehen über JSON")
    func importExport() throws {
        let library = WorkoutLibrary(storage: InMemoryStorage())
        let data = try library.exportData([BuiltInWorkouts.vo2max5x3])
        let imported = try library.importWorkouts(from: data)
        #expect(imported.count == 1)
        #expect(imported[0].isBuiltIn == false)
        #expect(imported[0].id != BuiltInWorkouts.vo2max5x3.id)
        #expect(imported[0].segments.count == BuiltInWorkouts.vo2max5x3.segments.count)
    }

    @Test("Sehr kurze Einheiten landen nicht im Verlauf")
    func ignoresTinyRides() {
        let store = SessionStore(storage: InMemoryStorage())
        store.add(makeRecord(duration: 30))
        #expect(store.sessions.isEmpty)
        store.add(makeRecord(duration: 600))
        #expect(store.sessions.count == 1)
    }

    @Test("Ohne Sekundenaufzeichnung wird die Spur verworfen (Apple TV)")
    func dropsSamplesWhenAsked() {
        let store = SessionStore(storage: InMemoryStorage(), keepsSampleTracks: false)
        store.add(makeRecord(duration: 600, samples: 600))
        #expect(store.sessions.first?.samples.isEmpty == true)
        #expect(store.sessions.first?.averagePower == 200)
    }

    @Test("Die Wochenbelastung summiert nur die letzten sieben Tage")
    func weeklyStress() {
        let store = SessionStore(storage: InMemoryStorage())
        let now = Date()
        store.add(makeRecord(duration: 3600, startedAt: now.addingTimeInterval(-86400), tss: 80))
        store.add(makeRecord(duration: 3600, startedAt: now.addingTimeInterval(-20 * 86400), tss: 90))
        #expect(store.stressLast(days: 7, now: now) == 80)
        #expect(store.stressLast(days: 30, now: now) == 170)
    }

    @Test("Einstellungen überleben einen Neustart")
    func settingsPersist() {
        let storage = InMemoryStorage()
        let store = SettingsStore(storage: storage)
        store.rider.ftp = 265
        store.settings.simulatorEnabled = true

        let reloaded = SettingsStore(storage: storage)
        #expect(reloaded.rider.ftp == 265)
        #expect(reloaded.settings.simulatorEnabled)
    }

    @Test("CSV-Export enthält Kopfzeile und alle Werte")
    func csvExport() {
        let record = makeRecord(duration: 3, samples: 3)
        let lines = record.csv().split(separator: "\n")
        #expect(lines.count == 4)
        #expect(lines[0] == "seconds,power,target,cadence,heart_rate,speed_kmh")
        #expect(lines[1] == "0,200,210,90,140,")
    }

    // MARK: Hilfsmittel

    private func makeRecord(
        duration: TimeInterval,
        startedAt: Date = Date(),
        tss: Int = 50,
        samples: Int = 0
    ) -> SessionRecord {
        SessionRecord(
            workoutName: "Test",
            startedAt: startedAt,
            duration: duration,
            completed: true,
            ftp: 200,
            averagePower: 200,
            maxPower: 300,
            normalizedPower: 210,
            intensityFactor: 1.05,
            trainingStressScore: tss,
            kilojoules: 400,
            samples: (0..<samples).map {
                RideSample(
                    elapsed: TimeInterval($0),
                    power: 200,
                    targetPower: 210,
                    cadence: 90,
                    heartRate: 140
                )
            }
        )
    }
}
