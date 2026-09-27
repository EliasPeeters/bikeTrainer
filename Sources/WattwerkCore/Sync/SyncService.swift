import Foundation
import Observation

/// Gleicht Programme, Wochenplan, Einheiten und Fahrerprofil mit dem Server ab.
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
    @ObservationIgnored private let plan: TrainingPlanStore
    @ObservationIgnored private var planPush: Task<Void, Never>?

    public init(
        account: AccountStore,
        library: WorkoutLibrary,
        sessions: SessionStore,
        settings: SettingsStore,
        plan: TrainingPlanStore
    ) {
        self.account = account
        self.library = library
        self.sessions = sessions
        self.settings = settings
        self.plan = plan
    }

    public var isSyncing: Bool { status == .syncing }

    /// Der vollständige Abgleich: Profil, Programme, Wochenplan, Einheiten, Reihen.
    public func syncAll() async {
        guard account.isSignedIn else { return }
        status = .syncing
        do {
            try await syncProfile()
            try await syncWorkouts()
            try await uploadSessions()
            // Nach den Programmen, damit der Server die frisch hochgeschobenen
            // schon kennt und im Plan auflösen kann. Und nach den Einheiten:
            // ein Problem mit dem Plan soll keine gefahrene Einheit aufhalten.
            try await syncPlan()
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
        plan.detachFromAccount()
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

    /// Nach einer Änderung am Plan - ohne gleich alles andere mit abzugleichen.
    ///
    /// Einer nach dem anderen: wer im Menü schnell drei Tage anklickt, schickt
    /// drei Pläne los. Überholt der erste dabei den dritten, bliebe auf dem
    /// Server ein älterer Stand stehen, während das Gerät sich für abgeglichen hält.
    public func pushPlan() async {
        let previous = planPush
        let push = Task { [weak self] in
            await previous?.value
            await self?.performPlanPush()
        }
        planPush = push
        await push.value
    }

    private func performPlanPush() async {
        guard account.isSignedIn else { return }
        do {
            try await syncPlan()
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

    /// Der Wochenplan: wer zuletzt geändert hat, gewinnt - wie beim Profil.
    ///
    /// Mit einer Ausnahme beim ersten Mal: ein Plan, der ohne Konto entstanden
    /// ist, wird mit dem des Servers zusammengeführt statt ihn zu ersetzen.
    /// Siehe `TrainingPlanStore.needsUpload`.
    ///
    /// Ein Server ohne `/plan` - also einer, der noch vor 1.1 steht - antwortet
    /// mit 404. Das ist kein Fehler des Abgleichs: der Plan bleibt dann eben
    /// nur auf dem Gerät, und alles andere läuft weiter wie bisher.
    private func syncPlan() async throws {
        // Was während der Anfrage auf dem Gerät geändert wird, darf die
        // Antwort nicht überschreiben - dann geht es beim nächsten Mal hoch.
        let changeBeforeRequest = plan.updatedAt
        let remote: [PlanEntryPayload]
        do {
            if plan.needsUpload, plan.hasNeverSynced {
                let current = try await account.client.plan().compactMap { $0.makeEntry() }
                remote = try await account.client.savePlan(plan.merged(with: current))
            } else if plan.needsUpload {
                remote = try await account.client.savePlan(plan.entries)
            } else {
                remote = try await account.client.plan()
            }
        } catch let APIError.server(code, _) where code == "NOT_FOUND" || code == "HTTP_404" {
            return
        }
        guard plan.updatedAt == changeBeforeRequest else { return }
        plan.applyRemote(remote.compactMap { payload in
            guard var entry = payload.makeEntry() else { return nil }
            // Eigene und mitgelieferte Programme werden über ihre Kennung
            // aufgelöst; eine Kopie brauchen nur fremde.
            if library.workout(id: entry.workoutID) != nil { entry.workout = nil }
            return entry
        })
    }

    private func uploadSessions() async throws {
        var rejected: Error?
        for record in sessions.pendingUploads {
            do {
                try await account.client.upload(session: record, track: sessions.track(for: record))
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
