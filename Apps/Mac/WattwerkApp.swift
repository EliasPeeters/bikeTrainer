import SwiftUI
import WattwerkUI

/// The Mac app. One window, everything inside it.
@main
struct WattwerkApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .frame(minWidth: 960, minHeight: 640)
        }
        .defaultSize(width: 1240, height: 820)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
