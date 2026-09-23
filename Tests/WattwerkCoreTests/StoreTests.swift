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

    /// `add` wird nur nach einem Druck auf „Speichern“ gerufen - neben einem
    /// Knopf „Verwerfen“. Eine Längenschwelle würde diese Entscheidung
    /// stillschweigend überstimmen, und die Einheit fehlte danach im Verlauf
    /// wie in der Cloud, ohne dass irgendwo etwas davon stünde.
    @Test("Auch eine sehr kurze Einheit landet im Verlauf, wenn sie gespeichert wird")
    func keepsTinyRides() {
        let store = SessionStore(storage: InMemoryStorage())
        store.add(makeRecord(duration: 30))
        #expect(store.sessions.count == 1)
        store.add(makeRecord(duration: 600))
        #expect(store.sessions.count == 2)
    }

    @Test("Eine gespeicherte Einheit gilt als ausstehend, bis der Server sie hat")
    func newRidesAreQueuedForUpload() {
        let storage = InMemoryStorage()
        let store = SessionStore(storage: storage)
        store.add(makeRecord(duration: 600))
        let id = try! #require(store.sessions.first?.id)
        #expect(store.pendingUploads.count == 1)

        store.markUploaded(id: id)
        #expect(store.pendingUploads.isEmpty)
        // Und der Vermerk überlebt den Neustart, sonst wandert dieselbe
        // Einheit beim nächsten Abgleich noch einmal hoch.
        #expect(SessionStore(storage: storage).pendingUploads.isEmpty)
    }

    @Test("Ohne Sekundenaufzeichnung trägt der Verlauf die Spur nicht mit (Apple TV)")
    func dropsSamplesWhenAsked() {
        let store = SessionStore(storage: InMemoryStorage(), keepsSampleTracks: false)
        store.add(makeRecord(duration: 600, samples: 600))
        #expect(store.sessions.first?.samples.isEmpty == true)
        #expect(store.sessions.first?.averagePower == 200)
    }

    /// Der Fall, der vorher die Kurve kostete: Apple TV, kein Netz. Die Einheit
    /// liegt als ausstehend herum, und ohne Zwischenlager wäre ihre Spur beim
    /// Speichern gelöscht worden - hochgeladen käme nur die Zusammenfassung an.
    @Test("Die Spur einer ausstehenden Einheit überlebt auch ohne Sekundenaufzeichnung")
    func keepsTrackForPendingUpload() {
        let storage = InMemoryStorage()
        let store = SessionStore(storage: storage, keepsSampleTracks: false)
        store.add(makeRecord(duration: 600, samples: 600))
        let record = try! #require(store.sessions.first)

        let track = try! #require(store.track(for: record))
        #expect(track.sampleCount == 600)
        #expect(track.heartRate?.compactMap { $0 }.count == 600)
        #expect(store.samples(for: record).count == 600)

        // Und sie übersteht einen Neustart, denn genau dann ist noch kein Netz
        // da gewesen.
        let reloaded = SessionStore(storage: storage, keepsSampleTracks: false)
        #expect(reloaded.track(for: try! #require(reloaded.sessions.first))?.sampleCount == 600)
    }

    @Test("Nach dem Upload wird die zwischengelagerte Spur weggeräumt")
    func dropsTrackOnceUploaded() {
        let store = SessionStore(storage: InMemoryStorage(), keepsSampleTracks: false)
        store.add(makeRecord(duration: 600, samples: 600))
        let record = try! #require(store.sessions.first)

        store.markUploaded(id: record.id)
        #expect(store.track(for: record) == nil)
        // Die Einheit selbst bleibt - nur die Kurve liegt jetzt beim Server.
        #expect(store.sessions.count == 1)
    }

    @Test("Eine gelöschte Einheit nimmt ihre Spur mit")
    func deletingTakesTrack() {
        let store = SessionStore(storage: InMemoryStorage(), keepsSampleTracks: false)
        store.add(makeRecord(duration: 600, samples: 600))
        let record = try! #require(store.sessions.first)

        store.delete(id: record.id)
        #expect(store.track(for: record) == nil)
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

    @Test("Eine lokale Profiländerung gewinnt, eine übernommene nicht")
    func profileSyncDirection() {
        let store = SettingsStore(storage: InMemoryStorage())

        // Noch nie abgeglichen: im Zweifel hochschieben, damit eine nach einem
        // Test eingetragene FTP nicht verlorengeht.
        #expect(store.riderNeedsUpload)

        store.markProfileSynced()
        #expect(!store.riderNeedsUpload)

        // Änderung auf dem Gerät -> das Gerät gewinnt.
        store.rider.ftp = 280
        #expect(store.riderNeedsUpload)

        store.markProfileSynced()
        #expect(!store.riderNeedsUpload)

        // Vom Server übernommen -> gilt nicht als lokale Änderung, sonst käme
        // der Server nie zum Zug.
        var remote = store.rider
        remote.ftp = 265
        store.applyRemoteRider(remote)
        #expect(!store.riderNeedsUpload)
        #expect(store.rider.ftp == 265)
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
