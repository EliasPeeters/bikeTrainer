import SwiftUI
import WattwerkCore

/// Konto anlegen, anmelden, abgleichen.
///
/// Die App läuft vollständig ohne Konto - dieser Bildschirm erklärt, was eines
/// zusätzlich bringt, und versteckt nichts dahinter.
struct AccountView: View {
    let model: AppModel

    @State private var mode: Mode = .register
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var showsDeleteConfirmation = false
    @State private var deletePassword = ""
    @State private var deleteError: String?
    #if DEBUG
    @State private var serverURL = ""
    #endif

    enum Mode: String, CaseIterable, Identifiable {
        case register = "Konto anlegen"
        case login = "Anmelden"
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if model.account.isSignedIn {
                    signedInCard
                    syncCard
                    deleteCard
                } else {
                    benefitsCard
                    formCard
                }
                #if DEBUG
                serverCard
                #endif
            }
            .padding(24)
            .frame(maxWidth: 820 * Theme.scale)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.background)
        .sectionTitle("Konto")
        #if DEBUG
        .onAppear { serverURL = model.settings.settings.apiBaseURL }
        #endif
    }

    // MARK: Angemeldet

    private var signedInCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Image(systemName: "checkmark.icloud.fill")
                    .font(.system(size: 26 * Theme.scale))
                    .foregroundStyle(Theme.positive)
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.account.user?.name.isEmpty == false
                        ? model.account.user!.name
                        : (model.account.user?.email ?? "Angemeldet"))
                        .font(.system(size: 18 * Theme.scale, weight: .semibold))
                    Text(model.account.user?.email ?? "")
                        .font(.system(size: 13 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Abmelden") {
                    model.account.logout()
                }
                .buttonStyle(.bordered)
            }

            Text("Programme, Ordner und gefahrene Einheiten liegen in der Cloud und stehen auf jedem Gerät zur Verfügung - auch im Web-Portal.")
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private var syncCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Abgleich")
                    .font(.system(size: 18 * Theme.scale, weight: .semibold))
                Spacer()
                Button {
                    Task { await model.sync.syncAll() }
                } label: {
                    Label("Jetzt abgleichen", systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.sync.isSyncing)
            }

            HStack(spacing: 16) {
                MetricTile(label: "Programme", value: "\(model.library.userWorkouts.count)")
                MetricTile(label: "Einheiten", value: "\(model.sessions.sessions.count)")
                MetricTile(
                    label: "Ausstehend",
                    value: "\(model.sessions.pendingUploads.count)",
                    tint: model.sessions.pendingUploads.isEmpty ? .white : Theme.accent
                )
            }

            switch model.sync.status {
            case .idle:
                EmptyView()
            case .syncing:
                Label("Läuft …", systemImage: "arrow.triangle.2.circlepath")
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(.secondary)
            case let .done(date):
                Label(
                    "Zuletzt abgeglichen \(date.formatted(date: .omitted, time: .shortened))",
                    systemImage: "checkmark.circle"
                )
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(Theme.positive)
            case let .failed(message):
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(Theme.negative)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    /// Konto löschen.
    ///
    /// Sichtbar und ohne Umweg über eine Webseite: Richtlinie 5.1.1(v) des App
    /// Store verlangt, dass ein in der App angelegtes Konto dort auch wieder
    /// wegkann. Das Passwort muss mit, damit ein fremdes Gerät mit gültigem
    /// Token nicht genügt.
    private var deleteCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Konto löschen")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))
                .foregroundStyle(Theme.negative)

            Text("Löscht dein Konto endgültig, dazu alle Einheiten, Programme und Ordner auf dem Server - auch öffentlich geteilte. Programme auf diesem Gerät bleiben erhalten, dann ohne Abgleich.")
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)

            if showsDeleteConfirmation {
                labelled("Zur Bestätigung dein Passwort") {
                    SecureField("Passwort", text: $deletePassword)
                }

                if let deleteError {
                    Label(deleteError, systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 13 * Theme.scale))
                        .foregroundStyle(Theme.negative)
                }

                HStack(spacing: 12) {
                    Button(role: .destructive) {
                        Task {
                            deleteError = nil
                            let deleted = await model.account.deleteAccount(password: deletePassword)
                            if deleted {
                                model.sync.detachFromAccount()
                                deletePassword = ""
                                showsDeleteConfirmation = false
                            } else {
                                deleteError = model.account.lastError ?? "Das hat nicht geklappt."
                            }
                        }
                    } label: {
                        Label("Endgültig löschen", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                    .disabled(model.account.isBusy || deletePassword.isEmpty)

                    Button("Abbrechen") {
                        showsDeleteConfirmation = false
                        deletePassword = ""
                        deleteError = nil
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                Button(role: .destructive) {
                    showsDeleteConfirmation = true
                } label: {
                    Label("Konto löschen …", systemImage: "trash")
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    // MARK: Nicht angemeldet

    private var benefitsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ohne Konto geht alles, mit Konto überall")
                .font(.system(size: 18 * Theme.scale, weight: .semibold))
            Text("Du kannst Wattwerk vollständig ohne Anmeldung benutzen - Programme bauen, fahren, auswerten. Ein Konto bringt nur eines dazu: alles liegt in der Cloud.")
                .font(.system(size: 14 * Theme.scale))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                benefit("Programme am Mac bauen, am Apple TV fahren")
                benefit("Einheiten landen im Verlauf des Web-Portals")
                benefit("Eigene Programme teilen und die anderer entdecken")
            }
            .padding(.top, 4)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private func benefit(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "checkmark")
                .font(.system(size: 11 * Theme.scale, weight: .bold))
                .foregroundStyle(Theme.positive)
            Text(text)
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
        }
    }

    private var formCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if mode == .register {
                labelled("Name (optional)") {
                    TextField("Name", text: $name)
                }
            }
            labelled("E-Mail") {
                TextField("dein@beispiel.de", text: $email)
                    #if !os(macOS)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()
            }
            labelled("Passwort") {
                SecureField("mindestens 8 Zeichen", text: $password)
            }

            if let error = model.account.lastError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 13 * Theme.scale))
                    .foregroundStyle(Theme.negative)
            }

            Button {
                Task {
                    if mode == .register {
                        await model.account.register(email: email, password: password, name: name)
                    } else {
                        await model.account.login(email: email, password: password)
                    }
                    if model.account.isSignedIn {
                        password = ""
                        // Nach der Anmeldung wandert alles hoch, was lokal
                        // entstanden ist, während niemand angemeldet war.
                        await model.sync.syncAll()
                    }
                }
            } label: {
                Text(mode == .register ? "Konto anlegen" : "Anmelden")
                    .font(.system(size: 16 * Theme.scale, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.account.isBusy || email.isEmpty || password.count < 8)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private func labelled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 12 * Theme.scale, weight: .semibold))
                .foregroundStyle(.secondary)
            content()
                .textFieldStyle(.plain)
                .font(.system(size: 15 * Theme.scale))
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.black.opacity(0.3))
                )
        }
    }

    // MARK: Server (nur in Entwicklungsbauten)

    #if DEBUG
    /// Sichtbar nur im Debug-Bau. In einer ausgelieferten App wäre ein Feld für
    /// die Serveradresse kein Werkzeug, sondern eine Möglichkeit, die App
    /// kaputtzukonfigurieren - dort steht die Adresse fest in `APIEnvironment`.
    private var serverCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Entwicklung", systemImage: "hammer.fill")
                .font(.system(size: 13 * Theme.scale, weight: .semibold))
                .foregroundStyle(Theme.accent)
            Text("Serveradresse. Ein Wechsel meldet ab, weil Tokens nur für den Server gelten, der sie ausgestellt hat.")
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)

            TextField(APIEnvironment.defaultBaseURL, text: $serverURL)
                .textFieldStyle(.plain)
                .font(.system(size: 14 * Theme.scale, design: .monospaced))
                .autocorrectionDisabled()
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.black.opacity(0.3))
                )
                .onSubmit { applyServerURL() }

            HStack {
                Button("Übernehmen") { applyServerURL() }
                    .buttonStyle(.bordered)
                    .disabled(serverURL == model.settings.settings.apiBaseURL)
                Spacer()
                Button("Zurücksetzen") {
                    serverURL = APIEnvironment.defaultBaseURL
                    applyServerURL()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(Theme.surfaceRaised)
    }

    private func applyServerURL() {
        let trimmed = serverURL.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        model.settings.settings.apiBaseURL = trimmed
        model.account.updateBaseURL(APIEnvironment.url(from: trimmed))
    }
    #endif
}
