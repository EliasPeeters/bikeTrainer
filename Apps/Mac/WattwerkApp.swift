import SwiftUI
import WattwerkUI

/// The Mac app. One window, everything inside it.
///
/// `Window` statt `WindowGroup`: genau ein Fenster, und SwiftUI trägt es ins
/// Fenster-Menü ein. Wer es schließt, holt es dort (oder mit ⌘0 bzw. einem
/// Klick aufs Dock-Symbol) zurück. Der Zustand hängt an `AppModel.shared`,
/// eine laufende Fahrt überlebt das Schließen also.
@main
struct WattwerkApp: App {
    var body: some Scene {
        Window("Wattwerk", id: "main") {
            RootView()
                .frame(minWidth: 960, minHeight: 640)
        }
        .defaultSize(width: 1240, height: 820)
        .keyboardShortcut("0", modifiers: .command)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
