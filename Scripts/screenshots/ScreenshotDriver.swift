import Foundation
import SwiftUI
import WattwerkCore
#if os(macOS)
import AppKit
#endif

/// TEMPORÄR – nur zum Erzeugen der Store- und Landingpage-Screenshots.
///
/// Auf diesem Rechner gibt es keine Simulator.app (Xcode 27) und keine
/// Bildschirmaufnahme-Rechte, also fährt die App sich für den Screenshot
/// selbst in den gewünschten Zustand. Wird über `WATTWERK_SHOT` in der
/// Prozessumgebung aktiviert und ist ohne diese Variable komplett inaktiv.
@MainActor
public enum ScreenshotDriver {
    public static var scene: String? {
        ProcessInfo.processInfo.environment["WATTWERK_SHOT"]
    }

    public static var isActive: Bool { scene != nil }

    /// Auf welches Programm die Bibliothek springen soll.
    public static var detailWorkoutName: String? {
        scene == "detail" ? (ProcessInfo.processInfo.environment["WATTWERK_WORKOUT"] ?? "Sweet Spot 3×12") : nil
    }

    /// Das Programm, das im Editor offen stehen soll.
    public static var editorWorkout: Workout {
        Workout(
            name: "Schwelle 2×20",
            summary: "Zwei lange Blöcke an der Schwelle, fünf Minuten Pause dazwischen",
            segments: [
                .ramp(600, fromPercentFTP: 0.45, toPercentFTP: 0.70, title: "Einfahren"),
                .steady(1200, percentFTP: 0.98, title: "Block 1", cadence: 85...95),
                .steady(300, percentFTP: 0.55, title: "Pause"),
                .steady(1200, percentFTP: 0.98, title: "Block 2", cadence: 85...95),
                .ramp(300, fromPercentFTP: 0.55, toPercentFTP: 0.40, title: "Ausfahren"),
            ]
        )
    }

    public static func run(model: AppModel) {
        guard let scene else { return }

        model.setSimulatorEnabled(true)

        switch scene {
        case "library", "detail", "editor":
            model.section = .training
        case "devices":
            model.section = .devices
        case "history":
            model.section = .history
        case "profile":
            model.section = .profile
        case "account":
            model.section = .account
        case "ride":
            model.section = .training
            ride(model: model, seconds: 13 * 60)
        case "summary":
            model.section = .training
            ride(model: model, seconds: 0)
            model.engine.stop()
        case "seed":
            seedHistory(model: model)
        default:
            break
        }
    }

    // MARK: Fahrt

    /// Startet eine Einheit und spult sie im Zeitraffer vor: je simulierter
    /// Sekunde ein Messwert und ein Tick. Damit stimmen Dauer, Durchschnitt,
    /// NP und kJ zueinander – es ist dieselbe Rechnung wie bei einer echten
    /// Fahrt, nur ohne echtes Warten.
    private static func ride(model: AppModel, seconds: Int) {
        model.setSimulatorEnabled(true)
        model.settings.settings.startCountdownSeconds = 0
        let workout = workout(named: ProcessInfo.processInfo.environment["WATTWERK_WORKOUT"] ?? "Sweet Spot 3×12")
        model.startRide(workout)
        model.settings.settings.startCountdownSeconds = 3
        fastForward(model: model, seconds: seconds == 0 ? Int(workout.duration) : seconds, from: Date())
    }

    private static func fastForward(model: AppModel, seconds: Int, from start: Date) {
        let engine = model.engine
        var generator = SystemRandomNumberGenerator()
        for second in 1...max(1, seconds) {
            guard engine.isActive else { break }
            let date = start.addingTimeInterval(TimeInterval(second))
            let target = engine.commandedWatts ?? 170
            let jitter = Int.random(in: -6...6, using: &generator)
            let power = max(0, target + jitter)
            let cadence = 88 + Int.random(in: -4...4, using: &generator)
            let effort = Double(target) / Double(max(1, model.settings.rider.ftp))
            let heartRate = min(186, Int(104 + effort * 70) + Int.random(in: -2...2, using: &generator))
            engine.ingest(
                TrainerReading(
                    power: power,
                    cadence: cadence,
                    speed: 26 + Double(power) / 12,
                    heartRate: heartRate,
                    timestamp: date
                )
            )
            engine.tick(at: date)
        }
    }

    private static func workout(named name: String) -> Workout {
        BuiltInWorkouts.all.first { $0.name == name } ?? BuiltInWorkouts.sweetSpot3x12
    }

    // MARK: Verlauf

    /// Fährt ein paar Einheiten der letzten Wochen im Zeitraffer durch, damit
    /// Verlauf und Profil nicht leer sind. Die Zahlen kommen aus der echten
    /// Auswertung, nicht aus einer Tabelle mit Wunschwerten.
    private static func seedHistory(model: AppModel) {
        guard model.sessions.sessions.isEmpty else { return }
        // Älteste zuerst: der Speicher legt jede neue Einheit vorne ab.
        let plan: [(String, Int)] = [
            ("Sweet Spot 3×12", 21),
            ("Tabata", 18),
            ("Pyramide", 15),
            ("Aktive Erholung 30", 12),
            ("VO2max 5×3", 10),
            ("30/30er", 8),
            ("Sweet Spot 3×12", 5),
            ("Over-Unders 3×9", 3),
            ("Grundlage 60", 1),
        ]
        let calendar = Calendar.current
        for (name, daysAgo) in plan {
            let workout = workout(named: name)
            let started = calendar.date(
                byAdding: .day,
                value: -daysAgo,
                to: calendar.date(bySettingHour: 18, minute: 30, second: 0, of: Date()) ?? Date()
            ) ?? Date()
            model.engine.setFTP(model.settings.rider.ftp)
            model.engine.trainerControl = model.simulator
            model.engine.start(workout, at: started)
            fastForward(model: model, seconds: Int(workout.duration), from: started)
            if let record = model.engine.lastRecord {
                model.sessions.add(record)
            }
            model.engine.reset()
        }
    }

    // MARK: Fenster auf dem Mac

    #if os(macOS)
    /// Stellt das Fenster für die Aufnahme hin: gewünschte Größe, und zwar auf
    /// dem Bildschirm mit der höchsten Auflösung - nur dort kommen aus
    /// 1440 × 900 Punkten auch 2880 × 1800 Pixel heraus.
    public static func placeWindowIfAsked() {
        guard let size = ProcessInfo.processInfo.environment["WATTWERK_SHOT_SIZE"] else { return }
        let parts = size.split(separator: "x").compactMap { Double($0) }
        guard parts.count == 2 else { return }
        DispatchQueue.main.async {
            guard let window = NSApplication.shared.windows.first(where: { $0.isVisible }) else { return }
            let screen = NSScreen.screens.max { $0.backingScaleFactor < $1.backingScaleFactor }
                ?? NSScreen.main
            guard let frame = screen?.visibleFrame else { return }
            let origin = NSPoint(
                x: frame.midX - parts[0] / 2,
                y: frame.midY - parts[1] / 2
            )
            window.setFrame(NSRect(origin: origin, size: NSSize(width: parts[0], height: parts[1])), display: true)
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
    }
    #endif
}
