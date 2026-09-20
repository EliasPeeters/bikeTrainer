import Foundation

/// The catalogue that ships with the app. Stable IDs so that ride history keeps
/// pointing at the right workout across releases.
public enum BuiltInWorkouts {
    public static let all: [Workout] = [
        grundlage60,
        sweetSpot3x12,
        overUnders,
        vo2max5x3,
        thirtyThirty,
        pyramide,
        tabata,
        kadenzspiel,
        aktiveErholung,
        rampentest,
        freieFahrt,
    ]

    // MARK: Building blocks

    public static func warmUp(_ duration: TimeInterval = 600) -> WorkoutSegment {
        .ramp(duration, fromPercentFTP: 0.45, toPercentFTP: 0.70, title: "Einfahren")
    }

    public static func coolDown(_ duration: TimeInterval = 300) -> WorkoutSegment {
        .ramp(duration, fromPercentFTP: 0.55, toPercentFTP: 0.40, title: "Ausfahren")
    }

    /// Repeats a work/rest pair and numbers the intervals for the ride screen.
    public static func intervals(
        count: Int,
        work: TimeInterval,
        workPercent: Double,
        rest: TimeInterval,
        restPercent: Double,
        label: String,
        workCadence: ClosedRange<Int>? = nil,
        dropsLastRest: Bool = true
    ) -> [WorkoutSegment] {
        var segments: [WorkoutSegment] = []
        for index in 1...count {
            segments.append(
                .steady(
                    work,
                    percentFTP: workPercent,
                    title: "\(label) \(index)/\(count)",
                    cadence: workCadence
                )
            )
            if index < count || !dropsLastRest {
                segments.append(.steady(rest, percentFTP: restPercent, title: "Pause \(index)"))
            }
        }
        return segments
    }

    private static func id(_ string: String) -> UUID {
        UUID(uuidString: string) ?? UUID()
    }

    // MARK: The workouts

    public static let grundlage60 = Workout(
        id: id("A1000000-0000-4000-8000-000000000001"),
        name: "Grundlage 60",
        summary: "Eine Stunde ruhig im Grundlagenbereich. Der Brot-und-Butter-Ride.",
        tags: ["Grundlage", "60 min"],
        segments: [
            warmUp(480),
            .steady(2400, percentFTP: 0.68, title: "Grundlage", cadence: 85...95),
            .steady(300, percentFTP: 0.60, title: "Lockerer Block"),
            .steady(1020, percentFTP: 0.70, title: "Grundlage", cadence: 85...95),
            coolDown(),
        ],
        isBuiltIn: true
    )

    public static let sweetSpot3x12 = Workout(
        id: id("A1000000-0000-4000-8000-000000000002"),
        name: "Sweet Spot 3×12",
        summary: "Drei lange Blöcke knapp unter der Schwelle. Baut Ausdauer ohne zu zerstören.",
        tags: ["Sweet Spot", "Schwelle"],
        segments: [warmUp()]
            + intervals(
                count: 3,
                work: 720,
                workPercent: 0.90,
                rest: 300,
                restPercent: 0.55,
                label: "Sweet Spot",
                workCadence: 85...95
            )
            + [coolDown()],
        isBuiltIn: true
    )

    public static let overUnders = Workout(
        id: id("A1000000-0000-4000-8000-000000000003"),
        name: "Over-Unders 3×9",
        summary: "Immer im Wechsel über und unter die Schwelle. Trainiert das Puffern von Laktat.",
        tags: ["Schwelle", "Fortgeschritten"],
        segments: {
            var segments: [WorkoutSegment] = [warmUp()]
            for block in 1...3 {
                for repetition in 1...3 {
                    segments.append(
                        .steady(120, percentFTP: 0.95, title: "Under \(block).\(repetition)")
                    )
                    segments.append(
                        .steady(60, percentFTP: 1.05, title: "Over \(block).\(repetition)")
                    )
                }
                if block < 3 {
                    segments.append(.steady(300, percentFTP: 0.50, title: "Pause \(block)"))
                }
            }
            segments.append(coolDown())
            return segments
        }(),
        isBuiltIn: true
    )

    public static let vo2max5x3 = Workout(
        id: id("A1000000-0000-4000-8000-000000000004"),
        name: "VO2max 5×3",
        summary: "Fünf harte Dreiminüter. Tut weh, wirkt schnell.",
        tags: ["VO2max", "Hart"],
        segments: [warmUp(720)]
            + intervals(
                count: 5,
                work: 180,
                workPercent: 1.18,
                rest: 180,
                restPercent: 0.50,
                label: "VO2max",
                workCadence: 95...105
            )
            + [coolDown(420)],
        isBuiltIn: true
    )

    public static let thirtyThirty = Workout(
        id: id("A1000000-0000-4000-8000-000000000005"),
        name: "30/30er",
        summary: "Zwei Serien à zehn Wiederholungen: 30 Sekunden hart, 30 Sekunden rollen.",
        tags: ["VO2max", "Intervalle"],
        segments: {
            var segments: [WorkoutSegment] = [warmUp()]
            for block in 1...2 {
                for repetition in 1...10 {
                    segments.append(
                        .steady(30, percentFTP: 1.20, title: "Hart \(block).\(repetition)", cadence: 100...110)
                    )
                    segments.append(.steady(30, percentFTP: 0.45, title: "Rollen"))
                }
                if block < 2 {
                    segments.append(.steady(420, percentFTP: 0.55, title: "Serienpause"))
                }
            }
            segments.append(coolDown())
            return segments
        }(),
        isBuiltIn: true
    )

    public static let pyramide = Workout(
        id: id("A1000000-0000-4000-8000-000000000006"),
        name: "Pyramide",
        summary: "1-2-3-4-3-2-1 Minuten aufwärts, dann wieder herunter. Nie langweilig.",
        tags: ["Intervalle", "Abwechslung"],
        segments: {
            var segments: [WorkoutSegment] = [warmUp()]
            let steps: [(minutes: Double, percent: Double)] = [
                (1, 1.20), (2, 1.12), (3, 1.05), (4, 1.00), (3, 1.05), (2, 1.12), (1, 1.20),
            ]
            for (index, step) in steps.enumerated() {
                segments.append(
                    .steady(
                        step.minutes * 60,
                        percentFTP: step.percent,
                        title: "Stufe \(Int(step.minutes)) min"
                    )
                )
                if index < steps.count - 1 {
                    segments.append(.steady(120, percentFTP: 0.50, title: "Pause"))
                }
            }
            segments.append(coolDown())
            return segments
        }(),
        isBuiltIn: true
    )

    public static let tabata = Workout(
        id: id("A1000000-0000-4000-8000-000000000007"),
        name: "Tabata",
        summary: "Zwei Blöcke à acht Mal 20 Sekunden voll, 10 Sekunden Pause.",
        tags: ["Anaerob", "Kurz & hart"],
        segments: {
            var segments: [WorkoutSegment] = [warmUp()]
            for block in 1...2 {
                for repetition in 1...8 {
                    segments.append(
                        .steady(20, percentFTP: 1.70, title: "Voll \(block).\(repetition)", cadence: 100...115)
                    )
                    segments.append(.steady(10, percentFTP: 0.40, title: "Pause"))
                }
                if block < 2 {
                    segments.append(.steady(300, percentFTP: 0.50, title: "Blockpause"))
                }
            }
            segments.append(coolDown())
            return segments
        }(),
        isBuiltIn: true
    )

    public static let kadenzspiel = Workout(
        id: id("A1000000-0000-4000-8000-000000000008"),
        name: "Kadenzspiel",
        summary: "Gleiche Leistung, wechselnde Trittfrequenz. Für runden Tritt und Kraftausdauer.",
        tags: ["Technik", "Kadenz"],
        segments: {
            var segments: [WorkoutSegment] = [warmUp()]
            for round in 1...4 {
                segments.append(
                    .steady(240, percentFTP: 0.75, title: "Hohe Kadenz \(round)", cadence: 100...110)
                )
                segments.append(
                    .steady(240, percentFTP: 0.78, title: "Kraftausdauer \(round)", cadence: 55...65)
                )
                segments.append(.steady(120, percentFTP: 0.55, title: "Locker"))
            }
            segments.append(coolDown())
            return segments
        }(),
        isBuiltIn: true
    )

    public static let aktiveErholung = Workout(
        id: id("A1000000-0000-4000-8000-000000000009"),
        name: "Aktive Erholung 30",
        summary: "Dreißig ruhige Minuten für den Tag nach dem harten Training.",
        tags: ["Erholung", "30 min"],
        segments: [
            .ramp(300, fromPercentFTP: 0.35, toPercentFTP: 0.50, title: "Anrollen"),
            .steady(1200, percentFTP: 0.52, title: "Locker", cadence: 90...100),
            .ramp(300, fromPercentFTP: 0.50, toPercentFTP: 0.35, title: "Ausrollen"),
        ],
        isBuiltIn: true
    )

    public static let rampentest = Workout(
        id: id("A1000000-0000-4000-8000-00000000000A"),
        name: "Rampentest (FTP)",
        summary: "Gleichmäßig steigende Rampe bis zum Abbruch. Danach FTP im Profil aktualisieren.",
        tags: ["Test", "FTP"],
        segments: [
            .steady(300, percentFTP: 0.50, title: "Einfahren", cadence: 85...95),
            .steady(180, percentFTP: 0.65, title: "Vorbereitung"),
            .ramp(1500, fromPercentFTP: 0.70, toPercentFTP: 1.70, title: "Rampe bis zum Abbruch"),
            .free(600, title: "Ausfahren frei"),
        ],
        isBuiltIn: true
    )

    public static let freieFahrt = Workout(
        id: id("A1000000-0000-4000-8000-00000000000B"),
        name: "Freie Fahrt",
        summary: "Keine Vorgabe. Der Trainer bleibt in seinem eigenen Widerstand, die App zeichnet auf.",
        tags: ["Frei"],
        segments: [.free(5400, title: "Freie Fahrt")],
        isBuiltIn: true
    )
}
