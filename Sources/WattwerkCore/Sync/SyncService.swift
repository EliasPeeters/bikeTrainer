import Foundation
import Observation

/// Gleicht Programme, Einheiten und Fahrerprofil mit dem Server ab.
///
/// Der Abgleich ist absichtlich einfach gehalten und an einer Stelle
/// beschrieben, statt über die App verteilt: Programme wandern hoch, wenn sie
/// neu oder seit dem letzten Abgleich geändert sind, und danach gilt die Liste
/// des Servers. Einheiten wandern nur hoch.
@MainActor
@Observable
public final class SyncService {
    public enum Status: Equatable, Sendable {
        case idle
        case syncing
        case failed(String)
        case done(Date)
    }

    public private(set) var status: Status = .idle
    /// Die Reihen für die Bibliothek, wie der Server sie zusammenstellt.
    public private(set) var discovery: DiscoveryPayload?

    @ObservationIgnored private let account: AccountStore
    @ObservationIgnored private let library: WorkoutLibrary
    @ObservationIgnored private let sessions: SessionStore
    @ObservationIgnored private let settings: SettingsStore

    public init(
        account: AccountStore,
        library: WorkoutLibrary,
        sessions: SessionStore,
        settings: SettingsStore
    ) {
        self.account = account
        self.library = library
        self.sessions = sessions
        self.settings = settings
    }

    public var isSyncing: Bool { status == .syncing }

    /// Der vollständige Abgleich: Profil, Programme, Einheiten, Reihen.
    public func syncAll() async {
        guard account.isSignedIn else { return }
        status = .syncing
        do {
            try await syncProfile()
            try await syncWorkouts()
            try await uploadSessions()
            discovery = try? await account.client.discover()
            status = .done(Date())
        } catch APIError.unauthorized {
            account.logout()
            status = .failed("Die Anmeldung ist abgelaufen.")
        } catch {
            status = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Nur die Reihen neu holen - nach einer Fahrt oder beim Öffnen der Bibliothek.
    /// Nach dem Löschen des Kontos: lokale Daten bleiben, verlieren aber ihre
    /// Bindung an den Server.
    public func detachFromAccount() {
        library.detachFromAccount()
        sessions.detachFromAccount()
        settings.markProfileDetached()
        discovery = nil
        status = .idle
    }

    public func refreshDiscovery() async {
        guard account.isSignedIn else {
            discovery = nil
            return
        }
        discovery = try? await account.client.discover()
    }

    /// Nach jeder gespeicherten Einheit. Schlägt es fehl, bleibt die Einheit
    /// als ausstehend liegen und geht beim nächsten Abgleich mit.
    ///
    /// Der Fehler wird dabei festgehalten, nicht verschluckt: sonst steht im
    /// Konto weiter „zuletzt abgeglichen“, während die Einheit nie ankommt -
    /// und genau das ist der Fall, den man sehen will.
    public func uploadPendingSessions() async {
        guard account.isSignedIn else { return }
        do {
            try await uploadSessions()
            status = .done(Date())
        } catch APIError.unauthorized {
            account.logout()
            status = .failed("Die Anmeldung ist abgelaufen.")
        } catch {
            status = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    // MARK: Einzelschritte

    private func syncProfile() async throws {
        // Wer zuletzt geändert hat, gewinnt - und zwar in beide Richtungen.
        //
        // Vorher schob das Gerät sein Profil immer hoch. Wer die FTP im
        // Web-Portal korrigierte, sah sie beim nächsten Abgleich wieder auf dem
        // alten Wert stehen, ohne dass irgendwo ein Fehler auftauchte.
        if settings.riderNeedsUpload {
            await account.pushProfile(settings.rider)
        } else {
            let remote = try await account.client.profile()
            settings.applyRemoteRider(remote.makeRiderProfile(keeping: settings.rider))
        }
        settings.markProfileSynced()
    }

    private func syncWorkouts() async throws {
        let outgoing = library.userWorkouts.filter(\.needsUpload)
        let now = Date()

        let serverWorkouts: [WorkoutPayload]
        if outgoing.isEmpty {
            serverWorkouts = try await account.client.myWorkouts()
        } else {
            serverWorkouts = try await account.client.syncWorkouts(
                outgoing.map { WorkoutPayload($0, referenceFTP: settings.rider.ftp) }
            )
        }

        // Danach gilt die Liste des Servers. Weil oben nur hochgeschoben wurde,
        // was neu oder geändert ist, verschwindet ein im Web gelöschtes
        // Programm hier auch wirklich - statt vom Gerät wieder aufzutauchen.
        library.replaceUserWorkouts(
            serverWorkouts.map { payload in
                var workout = payload.makeWorkout()
                workout.syncedAt = now
                return workout
            }
        )
    }

    private func uploadSessions() async throws {
        var rejected: Error?
        for record in sessions.pendingUploads {
            do {
                try await account.client.upload(session: record)
                sessions.markUploaded(id: record.id)
            } catch let error as APIError {
                switch error {
                case .server:
                    // Der Server lehnt genau diese eine Einheit ab. Hier
                    // abzubrechen hieße, den gesamten Verlauf an einem einzigen
                    // krummen Datensatz aufzuhängen - der bleibt liegen, der
                    // Rest geht hoch, und gemeldet wird trotzdem.
                    rejected = rejected ?? error
                case .offline, .unauthorized, .decoding:
                    // Kein Netz oder keine Anmeldung: dann klappt auch der
                    // nächste Versuch nicht. Später noch einmal von vorn.
                    throw error
                }
            }
        }
        if let rejected { throw rejected }
    }
}
