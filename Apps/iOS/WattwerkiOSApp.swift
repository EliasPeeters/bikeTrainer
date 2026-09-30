import SwiftUI
import WattwerkUI

/// The iPhone and iPad app. Same code as the Mac: a sidebar on the iPad, a tab
/// bar on the iPhone, and the ride screen over everything while you pedal.
@main
struct WattwerkiOSApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
