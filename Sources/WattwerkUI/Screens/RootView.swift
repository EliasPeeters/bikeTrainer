import SwiftUI
import WattwerkCore

/// The app shell. A sidebar on the Mac, a tab bar on the TV, and the ride
/// screen taking over the whole window while a workout is running.
public struct RootView: View {
    @State private var model: AppModel

    /// `AppModel.shared` als Standard statt `AppModel()`: ein Standardargument
    /// wird bei jedem Aufruf ausgewertet, und dieser hier würde eine komplette
    /// zweite App bauen.
    public init(model: AppModel? = nil) {
        _model = State(initialValue: model ?? AppModel.shared)
    }

    public var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if model.isRiding {
                RideView(model: model)
                    .transition(.opacity)
            } else {
                shell
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.isRiding)
        .preferredColorScheme(.dark)
        .tint(Theme.accent)
        .environment(model)
    }

    @ViewBuilder
    private var shell: some View {
        #if os(tvOS)
        TabView(selection: $model.section) {
            ForEach(AppModel.Section.allCases) { section in
                sectionView(section)
                    .tabItem { Label(section.title, systemImage: section.systemImage) }
                    .tag(section)
            }
        }
        #else
        NavigationSplitView {
            List(AppModel.Section.allCases, selection: $model.section) { section in
                Label(section.title, systemImage: section.systemImage)
                    .tag(section)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
            .safeAreaInset(edge: .bottom) {
                SensorSummaryBar(model: model)
                    .padding(12)
            }
        } detail: {
            sectionView(model.section)
        }
        #endif
    }

    @ViewBuilder
    private func sectionView(_ section: AppModel.Section) -> some View {
        switch section {
        case .training: LibraryView(model: model)
        case .devices: DevicesView(model: model)
        case .history: HistoryView(model: model)
        case .profile: ProfileView(model: model)
        case .account: AccountView(model: model)
        }
    }
}

/// Compact sensor status, shown in the Mac sidebar and the TV header.
struct SensorSummaryBar: View {
    let model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StatusPill(
                title: model.trainerName ?? "Kein Trainer",
                subtitle: model.trainerName == nil
                    ? "Nicht verbunden"
                    : (model.canControlTrainer ? "Steuerbar" : "Nur Messung"),
                color: model.hasPowerSource ? Theme.positive : .secondary,
                systemImage: "bicycle"
            )
            StatusPill(
                title: model.account.isSignedIn ? "Angemeldet" : "Ohne Konto",
                subtitle: model.account.user?.email ?? "Alles bleibt lokal",
                color: model.account.isSignedIn ? Theme.positive : .secondary,
                systemImage: model.account.isSignedIn ? "checkmark.icloud" : "icloud.slash"
            )
            StatusPill(
                title: model.heartRateName ?? "Kein Pulsgurt",
                subtitle: model.bluetooth.heartRateMonitor?.heartRate.map { "\($0) bpm" },
                color: model.heartRateName != nil ? Theme.heartRate : .secondary,
                systemImage: "heart.fill"
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
