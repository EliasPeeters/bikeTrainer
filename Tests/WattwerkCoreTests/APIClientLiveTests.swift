import Foundation
import Testing
@testable import WattwerkCore

/// Fährt den echten API-Client gegen einen laufenden Server.
///
/// Übersprungen, solange `WATTWERK_API_URL` nicht gesetzt ist - `swift test`
/// soll ohne Docker durchlaufen. Mit laufendem Stack:
///
///     WATTWERK_API_URL=http://localhost:8088 swift test --filter Live
///
/// Der Wert dieser Tests liegt darin, dass sie die Umwandlung zwischen dem
/// Swift-Modell und dem Drahtformat gegen die echte Gegenstelle prüfen. Eine
/// Attrappe würde genau die Abweichung wegdefinieren, die hier auffallen soll.
@Suite("Live-API", .enabled(if: ProcessInfo.processInfo.environment["WATTWERK_API_URL"] != nil))
struct APIClientLiveTests {
    private var client: APIClient {
        let url = URL(string: ProcessInfo.processInfo.environment["WATTWERK_API_URL"] ?? "http://localhost:8088")!
        return APIClient(baseURL: url)
    }

    private func freshEmail() -> String {
        "swift.\(UUID().uuidString.lowercased())@example.com"
    }

    @Test("Registrieren, Profil lesen, Profil schreiben")
    func accountRoundTrip() async throws {
        let client = self.client
        let email = freshEmail()

        let auth = try await client.register(email: email, password: "geheim12", name: "Swift")
        #expect(auth.user.email == email)
        #expect(auth.user.ftp == 200)
        #expect(!auth.accessToken.isEmpty)

        let profile = try await client.profile()
        #expect(profile.id == auth.user.id)

        var rider = RiderProfile()
        rider.ftp = 275
        rider.weightKg = 71.5
        let updated = try await client.updateProfile(rider)
        #expect(updated.ftp == 275)

        // Das Serverprofil fließt zurück ins lokale, ohne lokale Zusatzfelder
        // zu verlieren.
        let merged = updated.makeRiderProfile(keeping: rider)
        #expect(merged.ftp == 275)
        #expect(merged.weightKg == 71.5)
    }

    @Test("Ein Programm überlebt den Weg durch die API unverändert")
    func workoutRoundTrip() async throws {
        let client = self.client
        _ = try await client.register(email: freshEmail(), password: "geheim12", name: "Swift")

        // Ein Programm mit allem, was das Format hergibt: Rampe, konstanter
        // Block mit Trittfrequenz, absolute Watt und ein freier Block.
        let original = Workout(
            name: "Rundreise",
            summary: "Prüft das Drahtformat",
            tags: ["Test", "Format"],
            segments: [
                .ramp(600, fromPercentFTP: 0.45, toPercentFTP: 0.70, title: "Einfahren"),
                .steady(720, percentFTP: 0.90, title: "Sweet Spot", cadence: 85...95),
                .steady(300, watts: 180, title: "In Watt"),
                .free(240, title: "Frei"),
            ]
        )

        let saved = try await client.saveWorkout(WorkoutPayload(original, referenceFTP: 250))
        let returned = saved.makeWorkout()

        #expect(returned.name == original.name)
        #expect(returned.summary == original.summary)
        #expect(returned.tags == original.tags)
        #expect(returned.segments.count == original.segments.count)
        #expect(returned.duration == original.duration)
        // Neu angelegte Programme sind privat.
        #expect(returned.visibility == .private)
        #expect(returned.ownerName == "Swift")

        // Die Blöcke im Einzelnen - hier fällt auf, wenn Rampen, Kadenz oder
        // absolute Watt beim Umweg verloren gehen.
        #expect(returned.segments[0].intensity == original.segments[0].intensity)
        #expect(returned.segments[1].cadenceTarget == 85...95)
        #expect(returned.segments[2].intensity.startTarget == .watts(180))
        #expect(returned.segments[3].intensity.startTarget.isFree)

        // Der Server rechnet Dauer und Belastung selbst.
        #expect(saved.durationSeconds == 1860)
        #expect(saved.plannedTSS > 0)
    }

    @Test("Abgleich schiebt lokale Programme hoch")
    func syncWorkouts() async throws {
        let client = self.client
        _ = try await client.register(email: freshEmail(), password: "geheim12", name: "Swift")

        let local = [
            Workout(name: "Lokal A", segments: [.steady(600, percentFTP: 0.7)]),
            Workout(name: "Lokal B", segments: [.steady(900, percentFTP: 0.8)]),
        ]
        let synced = try await client.syncWorkouts(local.map { WorkoutPayload($0) })
        #expect(synced.count == 2)
        #expect(Set(synced.map(\.name)) == ["Lokal A", "Lokal B"])

        // Dieselben Kennungen ein zweites Mal legen nichts doppelt an.
        let again = try await client.syncWorkouts(local.map { WorkoutPayload($0) })
        #expect(again.count == 2)

        let listed = try await client.myWorkouts()
        #expect(listed.count == 2)
    }

    /// Anlegen und sofort etwas Geschütztes tun - der Weg, auf dem die
    /// Einheiten liegen blieben.
    ///
    /// `AccountStore` reichte die gespeicherten Tokens früher über einen
    /// unstrukturierten Task an den Client. Der lief irgendwann - unter anderem
    /// erst nach einer Anmeldung, und schrieb dann die Tokens von vorhin
    /// zurück, beim ersten Start also gar keine. Das Konto galt als angemeldet,
    /// jeder Aufruf kam aber als „Anmeldung erforderlich“ zurück.
    ///
    /// Achtung: dieser Test *belegt* das nicht. Ob der Task vor oder nach der
    /// Anmeldung lief, entschied die Ausführungsreihenfolge, und die lässt sich
    /// hier nicht erzwingen - mit dem alten Code läuft der Test mal so, mal so
    /// durch. Er hält den Weg offen, nicht das Wettrennen fest; dass die Tokens
    /// heute schon im `init` des Clients stehen, ist die eigentliche Absicherung.
    @MainActor
    @Test("Direkt nach dem Anlegen eines Kontos trägt die Anmeldung schon")
    func accountStoreIsUsableRightAfterRegistering() async throws {
        let url = URL(string: ProcessInfo.processInfo.environment["WATTWERK_API_URL"] ?? "http://localhost:8088")!
        let store = AccountStore(storage: InMemoryStorage(), baseURL: url)
        await store.register(email: freshEmail(), password: "geheim12", name: "Sofort")
        #expect(store.isSignedIn)
        #expect(store.lastError == nil)

        // Kein Umweg über einen Abgleich: ein geschützter Aufruf muss jetzt
        // durchgehen, sonst bliebe jede gefahrene Einheit liegen.
        let record = SessionRecord(
            workoutName: "Sofort nach Anmeldung",
            startedAt: Date(),
            duration: 30,
            completed: false,
            ftp: 200,
            averagePower: 180,
            maxPower: 180,
            normalizedPower: 180,
            intensityFactor: 0.9,
            trainingStressScore: 1,
            kilojoules: 5
        )
        try await store.client.upload(session: record)
    }

    @Test("Eine gefahrene Einheit landet im Verlauf")
    func uploadSession() async throws {
        let client = self.client
        _ = try await client.register(email: freshEmail(), password: "geheim12", name: "Swift")

        let record = SessionRecord(
            workoutName: "Hochgeladen",
            startedAt: Date(),
            duration: 2400,
            completed: true,
            ftp: 250,
            averagePower: 205,
            maxPower: 410,
            normalizedPower: 218,
            intensityFactor: 0.87,
            trainingStressScore: 50,
            kilojoules: 492,
            averageCadence: 88,
            averageHeartRate: 145,
            maxHeartRate: 172
        )
        try await client.upload(session: record)

        // Der Katalog steht auch ohne weitere Daten - und nach der Fahrt hat
        // die Bibliothek eine Reihe mehr.
        let discovery = try await client.discover()
        #expect(discovery.rows.contains { $0.key == "catalog" })
    }

    @Test("Der mitgelieferte Katalog ist derselbe wie in der App")
    func catalogMatchesBuiltIns() async throws {
        let client = self.client
        let discovery = try await client.discover()
        let catalog = try #require(discovery.rows.first { $0.key == "catalog" })

        let serverIDs = Set(catalog.workouts.map(\.id))
        let localIDs = Set(BuiltInWorkouts.all.map { $0.id.uuidString.lowercased() })

        // Gleiche Kennungen: lädt jemand seine Bibliothek herunter, entstehen
        // keine Dubletten neben dem lokalen Katalog.
        #expect(serverIDs == localIDs)

        for payload in catalog.workouts {
            let workout = payload.makeWorkout()
            let local = try #require(BuiltInWorkouts.all.first { $0.id == workout.id })
            #expect(workout.name == local.name)
            #expect(workout.segments.count == local.segments.count)
            #expect(Int(workout.duration) == Int(local.duration))
        }
    }

    @Test("Konto löschen nimmt alles mit")
    func deleteAccount() async throws {
        let client = self.client
        let email = freshEmail()
        _ = try await client.register(email: email, password: "geheim12", name: "Weg")

        _ = try await client.saveWorkout(
            WorkoutPayload(Workout(name: "Verschwindet", segments: [.steady(600, percentFTP: 0.7)]))
        )
        #expect(try await client.myWorkouts().count == 1)

        // Ohne richtiges Passwort passiert nichts.
        await #expect(throws: APIError.self) {
            try await client.deleteAccount(password: "falsch123")
        }
        #expect(try await client.myWorkouts().count == 1)

        try await client.deleteAccount(password: "geheim12")

        // Danach trägt das Token nicht mehr.
        await #expect(throws: APIError.self) {
            _ = try await client.myWorkouts()
        }
        // Und die Adresse ist wieder frei.
        let again = try await client.register(email: email, password: "anderes123", name: "Neu")
        #expect(again.user.email == email)
        #expect(try await client.myWorkouts().isEmpty)
    }

    @Test("Ohne Anmeldung bleiben geschützte Routen zu")
    func unauthenticatedIsRejected() async throws {
        let client = self.client
        await #expect(throws: APIError.self) {
            _ = try await client.myWorkouts()
        }
    }
}
