import SwiftUI
import WattwerkCore

/// The app shell. A sidebar on the Mac and the iPad, a tab bar on the TV and
/// the iPhone, and the ride screen taking over the whole window while a
/// workout is running.
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
        #elseif os(iOS)
        if horizontalSizeClass == .compact {
            compactShell
        } else {
            splitShell
        }
        #else
        splitShell
        #endif
    }

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// Das iPhone: eine Tab-Leiste wie auf dem Apple TV. Sechs Bereiche sind
    /// einer mehr, als die Leiste zeigt, und „Mehr“ schiebt seine Bereiche auf
    /// einen UIKit-Stapel, der die Titel von SwiftUI verschluckt. Also fünf
    /// Tabs, und das Konto hängt am Profil - beides ist „ich“.
    private var compactShell: some View {
        TabView(selection: compactSelection) {
            ForEach(Self.compactSections) { section in
                compactSectionView(section)
                    .tabItem { Label(section.title, systemImage: section.systemImage) }
                    .tag(section)
            }
        }
    }

    private static let compactSections: [AppModel.Section] = [.training, .plan, .devices, .history, .profile]

    private var compactSelection: Binding<AppModel.Section> {
        Binding(
            get: { model.section == .account ? .profile : model.section },
            set: { model.section = $0 }
        )
    }

    /// Training, Wochenplan und Verlauf bringen ihren eigenen Stapel mit. Die
    /// übrigen stehen auf dem Mac in der Detailspalte, die ihn stellt - in
    /// einem Tab gäbe es ohne ihn keinen Titel.
    @ViewBuilder
    private func compactSectionView(_ section: AppModel.Section) -> some View {
        switch section {
        case .training, .plan, .history:
            sectionView(section)
        case .devices, .account:
            NavigationStack { sectionView(section) }
        case .profile:
            NavigationStack {
                ProfileView(model: model)
                    .toolbar {
                        ToolbarItem(placement: .primaryAction) {
                            NavigationLink {
                                AccountView(model: model)
                            } label: {
                                Label(
                                    AppModel.Section.account.title,
                                    systemImage: model.account.isSignedIn ? "checkmark.icloud" : "icloud"
                                )
                                .labelStyle(.titleAndIcon)
                            }
                        }
                    }
            }
        }
    }
    #endif

    #if !os(tvOS)
    /// Mac und iPad: Seitenleiste links, Bereich rechts.
    private var splitShell: some View {
        NavigationSplitView {
            List(AppModel.Section.allCases, selection: sidebarSelection) { section in
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
    }

    /// Auf iOS verlangt eine Liste mit Einfachauswahl eine optionale Bindung.
    /// Abwählen gibt es in der Seitenleiste nicht, also bleibt der Bereich.
    private var sidebarSelection: Binding<AppModel.Section?> {
        Binding(
            get: { model.section },
            set: { if let section = $0 { model.section = section } }
        )
    }
    #endif

    @ViewBuilder
    private func sectionView(_ section: AppModel.Section) -> some View {
        switch section {
        case .training: LibraryView(model: model)
        case .plan: PlanView(model: model)
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
