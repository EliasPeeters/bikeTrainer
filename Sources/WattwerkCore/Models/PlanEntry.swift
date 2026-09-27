import Foundation

/// Ein Wochentag nach ISO 8601: die Woche beginnt am Montag.
///
/// Eigene Aufzählung statt `Calendar`s `weekday`: dort ist 1 der Sonntag, und
/// ob die Woche am Sonntag oder am Montag beginnt, hängt an der Region des
/// Geräts. Ein Plan, der auf dem Mac am Dienstag steht, soll auf dem Apple TV
/// nicht plötzlich am Mittwoch stehen, nur weil dort eine andere Region
/// eingestellt ist. Auf dem Draht ist es dieselbe Zahl (1 = Montag).
public enum Weekday: Int, CaseIterable, Identifiable, Hashable, Sendable, Codable, Comparable {
    case monday = 1
    case tuesday
    case wednesday
    case thursday
    case friday
    case saturday
    case sunday

    public var id: Int { rawValue }

    public var name: String {
        switch self {
        case .monday: return "Montag"
        case .tuesday: return "Dienstag"
        case .wednesday: return "Mittwoch"
        case .thursday: return "Donnerstag"
        case .friday: return "Freitag"
        case .saturday: return "Samstag"
        case .sunday: return "Sonntag"
        }
    }

    public var shortName: String {
        String(name.prefix(2))
    }

    /// Der Wochentag, auf den `date` im Kalender `calendar` fällt.
    public init(_ date: Date, calendar: Calendar = .current) {
        // `Calendar.weekday`: 1 = Sonntag … 7 = Samstag.
        let gregorian = calendar.component(.weekday, from: date)
        self = Weekday(rawValue: (gregorian + 5) % 7 + 1) ?? .monday
    }

    public static func < (lhs: Weekday, rhs: Weekday) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

/// Ein Eintrag im Wochenplan: an diesem Wochentag dieses Programm.
///
/// Der Plan ist eine Vorlage, kein Kalender - er wird einmal angelegt und gilt
/// jede Woche. Deshalb hängt ein Eintrag an einem Wochentag, nicht an einem
/// Datum.
public struct PlanEntry: Identifiable, Hashable, Sendable, Codable {
    public var id: UUID
    public var weekday: Weekday
    public var workoutID: UUID
    /// Der Name beim Einplanen. Damit bleibt ein Eintrag erkennbar, auch wenn
    /// das Programm inzwischen gelöscht ist oder auf diesem Gerät fehlt.
    public var workoutName: String
    /// Eine Kopie des Programms - nur für solche, die nicht in der eigenen
    /// Bibliothek liegen, etwa ein öffentliches aus „Entdecken“.
    ///
    /// Eigene und mitgelieferte Programme werden über `workoutID` aufgelöst
    /// und damit immer in ihrer aktuellen Fassung gefahren. Eine Kopie für
    /// jeden Eintrag würde auf dem Apple TV zudem in den rund 500 kB
    /// `UserDefaults` Platz belegen, den dort der Verlauf braucht.
    public var workout: Workout?
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        weekday: Weekday,
        workoutID: UUID,
        workoutName: String,
        workout: Workout? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.weekday = weekday
        self.workoutID = workoutID
        self.workoutName = workoutName
        self.workout = workout
        self.createdAt = createdAt
    }

    /// Nachsichtig, damit eine spätere Fassung Felder ergänzen kann, ohne dass
    /// diese hier den Plan verliert.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        weekday = try container.decode(Weekday.self, forKey: .weekday)
        workoutID = try container.decode(UUID.self, forKey: .workoutID)
        workoutName = try container.decodeIfPresent(String.self, forKey: .workoutName) ?? ""
        workout = try? container.decodeIfPresent(Workout.self, forKey: .workout)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
    }
}

/// Ein Tag der laufenden Woche: was geplant ist und was davon schon gefahren wurde.
public struct PlanDay: Identifiable, Hashable, Sendable {
    public let weekday: Weekday
    /// Mitternacht dieses Tages.
    public let date: Date
    public let entries: [PlanEntry]
    /// Einträge, zu denen es in dieser Woche schon eine gefahrene Einheit gibt.
    public let completedEntryIDs: Set<UUID>
    public let isToday: Bool
    public let isPast: Bool

    public var id: Weekday { weekday }

    public func isCompleted(_ entry: PlanEntry) -> Bool {
        completedEntryIDs.contains(entry.id)
    }

    public var openEntries: [PlanEntry] {
        entries.filter { !completedEntryIDs.contains($0.id) }
    }
}

public enum TrainingWeek {
    /// Montag, 0 Uhr, der Woche, in der `date` liegt.
    public static func start(of date: Date, calendar: Calendar = .current) -> Date {
        let day = calendar.startOfDay(for: date)
        let offset = Weekday(day, calendar: calendar).rawValue - 1
        return calendar.date(byAdding: .day, value: -offset, to: day) ?? day
    }

    /// Die sieben Tage der Woche um `now`, mit dem, was schon gefahren wurde.
    ///
    /// Eine Einheit hakt einen Eintrag ab, wenn sie dasselbe Programm war. Zuerst
    /// am selben Tag - danach irgendwo in derselben Woche, weil der Dienstag im
    /// echten Leben oft ein Mittwoch wird, und wer die Einheit dann fährt, hat
    /// sie trotzdem gefahren. Jede Einheit hakt höchstens einen Eintrag ab: wer
    /// zweimal dasselbe geplant hat, muss es auch zweimal fahren.
    public static func days(
        around now: Date = Date(),
        entries: [PlanEntry],
        sessions: [SessionRecord],
        calendar: Calendar = .current
    ) -> [PlanDay] {
        let weekStart = start(of: now, calendar: calendar)
        let today = calendar.startOfDay(for: now)
        let dates: [Weekday: Date] = Dictionary(uniqueKeysWithValues: Weekday.allCases.map { weekday in
            (weekday, calendar.date(byAdding: .day, value: weekday.rawValue - 1, to: weekStart) ?? weekStart)
        })
        let weekEnd = calendar.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart

        var unused = sessions
            .filter { $0.startedAt >= weekStart && $0.startedAt < weekEnd && $0.workoutID != nil }
            .sorted { $0.startedAt < $1.startedAt }
        var completed = Set<UUID>()

        func consume(_ entry: PlanEntry, where matches: (SessionRecord) -> Bool) {
            guard !completed.contains(entry.id),
                  let index = unused.firstIndex(where: { $0.workoutID == entry.workoutID && matches($0) })
            else { return }
            unused.remove(at: index)
            completed.insert(entry.id)
        }

        let ordered = entries.sorted { $0.weekday < $1.weekday }
        for entry in ordered {
            let day = dates[entry.weekday] ?? weekStart
            consume(entry) { calendar.isDate($0.startedAt, inSameDayAs: day) }
        }
        for entry in ordered {
            consume(entry) { _ in true }
        }

        return Weekday.allCases.map { weekday in
            let date = dates[weekday] ?? weekStart
            return PlanDay(
                weekday: weekday,
                date: date,
                entries: entries.filter { $0.weekday == weekday },
                completedEntryIDs: completed,
                isToday: date == today,
                isPast: date < today
            )
        }
    }
}
