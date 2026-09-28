import Foundation
import Testing
@testable import WattwerkCore

@MainActor
@Suite("Wochenplan")
struct PlanTests {
    /// Fester Kalender, damit die Tests nicht an der Zeitzone des Rechners hängen.
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return calendar
    }()

    /// Dienstag, 29. September 2026, 18 Uhr.
    private static let tuesday = calendar.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 18))!

    private static func day(_ offset: Int, hour: Int = 18) -> Date {
        let monday = calendar.date(from: DateComponents(year: 2026, month: 9, day: 28, hour: hour))!
        return calendar.date(byAdding: .day, value: offset, to: monday)!
    }

    private static func session(_ workout: Workout, at date: Date) -> SessionRecord {
        SessionRecord(
            workoutID: workout.id,
            workoutName: workout.name,
            startedAt: date,
            duration: workout.duration,
            completed: true,
            ftp: 250,
            averagePower: 200,
            maxPower: 300,
            normalizedPower: 210,
            intensityFactor: 0.84,
            trainingStressScore: 60,
            kilojoules: 700
        )
    }

    // MARK: Wochentage

    @Test("Wochentage zählen ab Montag, unabhängig vom Wochenbeginn der Region")
    func weekdayIsISO() {
        var sundayFirst = Self.calendar
        sundayFirst.firstWeekday = 1
        #expect(Weekday(Self.tuesday, calendar: sundayFirst) == .tuesday)
        #expect(Weekday(Self.day(6), calendar: sundayFirst) == .sunday)
        #expect(Weekday(Self.day(0), calendar: sundayFirst) == .monday)
        #expect(TrainingWeek.start(of: Self.day(6), calendar: sundayFirst) == Self.calendar.startOfDay(for: Self.day(0)))
    }

    // MARK: Speichern

    @Test("Der Plan wird gespeichert und wieder geladen")
    func persists() {
        let storage = InMemoryStorage()
        let plan = TrainingPlanStore(storage: storage)
        plan.add(BuiltInWorkouts.tabata, on: .tuesday)
        plan.add(BuiltInWorkouts.vo2max5x3, on: .thursday)

        let reloaded = TrainingPlanStore(storage: storage)
        #expect(reloaded.entries.count == 2)
        #expect(reloaded.entries(on: .tuesday).first?.workoutID == BuiltInWorkouts.tabata.id)
        #expect(reloaded.entries(on: .tuesday).first?.workout == nil)
        #expect(reloaded.updatedAt != nil)
    }

    @Test("Daten einer Fassung vor 1.1 ergeben einen leeren Plan und bleiben unberührt")
    func loadsDataFromOneZero() throws {
        let storage = InMemoryStorage()
        let library = WorkoutLibrary(storage: storage)
        library.add(Workout(name: "Eigenes", segments: [.steady(600, percentFTP: 0.8)]))
        let workoutsBefore = storage.data(forKey: "workouts")

        let plan = TrainingPlanStore(storage: storage)
        #expect(plan.isEmpty)
        #expect(plan.updatedAt == nil)
        #expect(plan.needsUpload == false)
        // Ein leerer Plan schreibt nichts - und fasst die übrigen Schlüssel nicht an.
        #expect(storage.data(forKey: "plan") == nil)
        #expect(storage.data(forKey: "workouts") == workoutsBefore)
    }

    @Test("Ein unlesbarer Eintrag kostet nur sich selbst, nicht den Plan")
    func skipsUnreadableEntries() throws {
        let storage = InMemoryStorage()
        let good = UUID().uuidString
        let json = """
        {"entries":[
          {"id":"\(good)","weekday":2,"workoutID":"\(BuiltInWorkouts.tabata.id.uuidString)","workoutName":"Tabata"},
          {"id":"\(UUID().uuidString)","weekday":9,"workoutID":"\(UUID().uuidString)","workoutName":"Aus der Zukunft"}
        ],"updatedAt":"2026-09-27T10:00:00Z","somethingNew":true}
        """
        storage.set(Data(json.utf8), forKey: "plan")

        let plan = TrainingPlanStore(storage: storage)
        #expect(plan.entries.map(\.id.uuidString) == [good])
        #expect(plan.updatedAt != nil)
    }

    @Test("Einträge lassen sich verschieben und entfernen, gelöschte Programme fallen heraus")
    func editing() {
        let plan = TrainingPlanStore(storage: InMemoryStorage())
        let first = plan.add(BuiltInWorkouts.tabata, on: .monday)
        plan.add(BuiltInWorkouts.tabata, on: .friday)
        let other = plan.add(BuiltInWorkouts.vo2max5x3, on: .monday)

        plan.move(id: first.id, to: .wednesday)
        #expect(plan.entries(on: .wednesday).map(\.id) == [first.id])
        #expect(plan.entries(on: .monday).map(\.id) == [other.id])

        plan.remove(id: other.id)
        #expect(plan.entries(on: .monday).isEmpty)

        plan.removeEntries(forWorkout: BuiltInWorkouts.tabata.id)
        #expect(plan.isEmpty)
    }

    // MARK: Abgleich

    @Test("Ein frisch angemeldetes Gerät ohne Plan überschreibt den Server nicht")
    func emptyDeviceDoesNotUpload() {
        let plan = TrainingPlanStore(storage: InMemoryStorage())
        #expect(plan.needsUpload == false)
        #expect(plan.hasNeverSynced)
    }

    @Test("Wer zuletzt geändert hat, gewinnt")
    func lastWriterWins() {
        let plan = TrainingPlanStore(storage: InMemoryStorage())
        let t0 = Date(timeIntervalSince1970: 1_000)
        plan.add(BuiltInWorkouts.tabata, on: .monday, at: t0)
        #expect(plan.needsUpload)

        plan.applyRemote(plan.entries, at: t0.addingTimeInterval(10))
        #expect(plan.needsUpload == false)

        plan.add(BuiltInWorkouts.vo2max5x3, on: .friday, at: t0.addingTimeInterval(20))
        #expect(plan.needsUpload)
        #expect(plan.hasNeverSynced == false)
    }

    @Test("Beim ersten Abgleich wird zusammengeführt, ohne Doppelte")
    func mergesOnFirstSync() {
        let plan = TrainingPlanStore(storage: InMemoryStorage())
        let local = plan.add(BuiltInWorkouts.tabata, on: .tuesday)

        let sameDaySameWorkout = PlanEntry(weekday: .tuesday, workoutID: BuiltInWorkouts.tabata.id, workoutName: "Tabata")
        let remoteOnly = PlanEntry(weekday: .saturday, workoutID: BuiltInWorkouts.vo2max5x3.id, workoutName: "VO2max")
        let merged = plan.merged(with: [sameDaySameWorkout, remoteOnly, local])

        #expect(merged.map(\.id) == [local.id, remoteOnly.id])
    }

    @Test("Nach einer Kontolöschung geht der Plan beim nächsten Konto mit")
    func detachKeepsPlan() {
        let plan = TrainingPlanStore(storage: InMemoryStorage())
        plan.add(BuiltInWorkouts.tabata, on: .tuesday)
        plan.applyRemote(plan.entries)
        #expect(plan.needsUpload == false)

        plan.detachFromAccount()
        #expect(plan.hasNeverSynced)
        #expect(plan.needsUpload)
        #expect(plan.entries.count == 1)
    }

    @Test("Die Serverantwort wird zu Einträgen, krumme Zeilen fallen heraus")
    func decodesPayload() throws {
        let workout = WorkoutPayload(BuiltInWorkouts.tabata)
        let json = """
        {"entries":[
          {"id":"\(UUID().uuidString.lowercased())","weekday":2,"workoutID":"\(workout.id)","workoutName":"Alter Name","sortIndex":0,"workout":\(String(data: try JSONEncoder().encode(workout), encoding: .utf8)!)},
          {"id":"\(UUID().uuidString.lowercased())","weekday":4,"workoutID":"\(UUID().uuidString.lowercased())","workoutName":"Gelöscht","sortIndex":0,"workout":null},
          {"id":"kaputt","weekday":1,"workoutID":"\(workout.id)","workoutName":"x","sortIndex":0,"workout":null}
        ]}
        """
        let payload = try JSONDecoder().decode(PlanPayload.self, from: Data(json.utf8))
        let entries = payload.entries.compactMap { $0.makeEntry() }

        #expect(entries.count == 2)
        #expect(entries[0].weekday == .tuesday)
        // Der aktuelle Name gewinnt über den beim Einplanen gemerkten.
        #expect(entries[0].workoutName == BuiltInWorkouts.tabata.name)
        #expect(entries[0].workout?.id == BuiltInWorkouts.tabata.id)
        #expect(entries[1].workoutName == "Gelöscht")
        #expect(entries[1].workout == nil)
    }

    // MARK: Die laufende Woche

    @Test("Eine Einheit am geplanten Tag hakt den Eintrag ab")
    func completesOnSameDay() {
        let tabata = BuiltInWorkouts.tabata
        let entry = PlanEntry(weekday: .tuesday, workoutID: tabata.id, workoutName: tabata.name)
        let days = TrainingWeek.days(
            around: Self.tuesday,
            entries: [entry],
            sessions: [Self.session(tabata, at: Self.day(1, hour: 7))],
            calendar: Self.calendar
        )

        #expect(days.count == 7)
        #expect(days.map(\.weekday) == Weekday.allCases)
        let tuesday = days[1]
        #expect(tuesday.isToday)
        #expect(tuesday.isCompleted(entry))
        #expect(days[0].isPast)
        #expect(days[2].isPast == false)
    }

    @Test("Verschoben gefahren zählt auch, aber jede Einheit nur einmal")
    func completesLaterInWeek() {
        let tabata = BuiltInWorkouts.tabata
        let tuesday = PlanEntry(weekday: .tuesday, workoutID: tabata.id, workoutName: tabata.name)
        let friday = PlanEntry(weekday: .friday, workoutID: tabata.id, workoutName: tabata.name)

        // Am Mittwoch statt am Dienstag gefahren - am Freitag noch nicht.
        let days = TrainingWeek.days(
            around: Self.day(3),
            entries: [tuesday, friday],
            sessions: [Self.session(tabata, at: Self.day(2))],
            calendar: Self.calendar
        )
        let completed = days[0].completedEntryIDs
        #expect(completed == [tuesday.id])
    }

    @Test("Die Woche davor und fremde Programme haken nichts ab")
    func ignoresOtherWeeksAndWorkouts() {
        let tabata = BuiltInWorkouts.tabata
        let entry = PlanEntry(weekday: .tuesday, workoutID: tabata.id, workoutName: tabata.name)
        let days = TrainingWeek.days(
            around: Self.tuesday,
            entries: [entry],
            sessions: [
                Self.session(tabata, at: Self.day(-6)),
                Self.session(BuiltInWorkouts.vo2max5x3, at: Self.day(1)),
            ],
            calendar: Self.calendar
        )
        #expect(days[1].completedEntryIDs.isEmpty)
    }

    // MARK: Andere Wochen und andere Geräte

    @Test("In einer vergangenen Woche ist alles vorbei und nichts heute")
    func pastWeek() {
        let tabata = BuiltInWorkouts.tabata
        let entry = PlanEntry(weekday: .friday, workoutID: tabata.id, workoutName: tabata.name)
        let days = TrainingWeek.days(
            around: Self.day(-7),
            today: Self.tuesday,
            entries: [entry],
            rides: [TrainingWeek.Ride(Self.session(tabata, at: Self.day(-3)))],
            calendar: Self.calendar
        )
        #expect(days.first?.date == Self.calendar.startOfDay(for: Self.day(-7)))
        #expect(days.allSatisfy { $0.isPast })
        #expect(!days.contains { $0.isToday })
        #expect(days[4].isCompleted(entry))
    }

    @Test("In einer kommenden Woche ist nichts vorbei")
    func futureWeek() {
        let days = TrainingWeek.days(around: Self.day(8), today: Self.tuesday, entries: [], rides: [], calendar: Self.calendar)
        #expect(days.allSatisfy { !$0.isPast && !$0.isToday })
        #expect(TrainingWeek.weekNumber(of: Self.day(0), calendar: Self.calendar) == 40)
        #expect(TrainingWeek.weekNumber(of: Self.day(7), calendar: Self.calendar) == 41)
    }

    @Test("Eine Einheit von einem anderen Gerät hakt ab, eine doppelte zählt einmal")
    func mergesRemoteRides() throws {
        let tabata = BuiltInWorkouts.tabata
        let vo2 = BuiltInWorkouts.vo2max5x3
        let local = Self.session(tabata, at: Self.day(1))
        let json = """
        {"sessions":[
          {"id":7,"clientID":"\(local.id.uuidString.lowercased())","workoutID":"\(tabata.id.uuidString.lowercased())","workoutName":"Tabata","startedAt":"2026-09-29T16:00:00.000Z","trainingStressScore":60,"hasTrack":false},
          {"id":8,"clientID":"\(UUID().uuidString.lowercased())","workoutID":"\(vo2.id.uuidString.lowercased())","workoutName":"VO2max","startedAt":"2026-10-01T16:00:00.000Z","trainingStressScore":63,"durationSeconds":2760}
        ]}
        """
        let remote = try JSONDecoder().decode(SessionSummaryListPayload.self, from: Data(json.utf8))
            .sessions.compactMap { $0.makeRide() }
        let rides = TrainingWeek.merge(local: [local], remote: remote)
        #expect(rides.count == 2)

        let entries = [
            PlanEntry(weekday: .tuesday, workoutID: tabata.id, workoutName: tabata.name),
            PlanEntry(weekday: .thursday, workoutID: vo2.id, workoutName: vo2.name),
        ]
        let days = TrainingWeek.days(around: Self.day(3), entries: entries, rides: rides, calendar: Self.calendar)
        #expect(days[0].completedEntryIDs == Set(entries.map(\.id)))
        #expect(TrainingWeek.rides(rides, inWeekOf: Self.day(3), calendar: Self.calendar).reduce(0) { $0 + $1.trainingStressScore } == 60 + 63)
    }
}
