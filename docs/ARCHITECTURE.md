# Aufbau

## Warum ein Package und nicht ein großes App-Target

Die Anforderung war von Anfang an „Mac und Apple TV, später iPad und iPhone“.
Das geht nur gut, wenn die Apps selbst fast nichts enthalten. Deshalb liegt
alles im Package `WattwerkKit`, und `Apps/Mac` und `Apps/TV` bestehen jeweils aus
genau einer Datei mit `@main`. Eine iOS-App hinzuzufügen heißt: ein Target
anlegen, `WattwerkUI` verlinken, `RootView()` aufrufen.

Drei Schichten, klar getrennt:

```
WattwerkUI          SwiftUI. Kennt Core und Bluetooth.
      ↓
WattwerkBluetooth   CoreBluetooth. Kennt Core.
      ↓
WattwerkCore        Nur Foundation. Kennt niemanden.
```

`WattwerkCore` hängt an nichts Plattformspezifischem. Das ist kein Selbstzweck:
Die Ride-Engine, die Zeitachse und die Trainingsmathematik sind das, was schief
gehen kann, und so lassen sie sich ohne Simulator, ohne Hardware und in
Millisekunden testen.

## Die Anschlussstellen

`WattwerkCore` definiert, was ein Trainer können muss, ohne zu wissen, wie er
angebunden ist:

```swift
@MainActor
public protocol TrainerControl: AnyObject {
    var supportsTargetPower: Bool { get }
    var supportedPowerRange: ClosedRange<Int>? { get }
    func requestControl() async throws
    func setTargetPower(_ watts: Int) async throws
    func releaseControl() async throws
}
```

Drei Dinge erfüllen diesen Vertrag: `TrainerSession` (echte FTMS-Hardware),
`SimulatedTrainer` (erfundener Fahrer) und `MockTrainer` in den Tests. Die Engine
merkt keinen Unterschied. Genau deshalb ist der Simulator kein Spielzeug, sondern
der Weg, auf dem die tvOS-App überhaupt entwickelbar ist.

Messwerte fließen in die andere Richtung als schlichte Rückrufe
(`onTrainerReading`, `onHeartRate`), die das `AppModel` in die Engine leitet.
Ein Pulsgurt gewinnt dabei immer gegen den vom Trainer weitergereichten Puls.

## Die Ride-Engine

`WorkoutEngine` ist das Herzstück und bewusst langweilig gebaut:

* **Eine Uhr.** Jeder Aufruf, der die Zeit braucht, bekommt sie übergeben –
  `tick(at:)`, `start(_:at:)`, `resume(at:)`. Die Engine ruft nie selbst `Date()`
  hinter dem Rücken des Aufrufers auf. Dadurch sind Tests vollständig
  deterministisch, und der Fehler, bei dem synthetische und echte Zeit sich
  vermischen, kann nicht wieder auftreten.
* **Gedeckelte Zeitsprünge.** Ein Tick zählt höchstens zwei Sekunden. Klappt der
  Laptop zu, verpasst man keine zehn Intervalle auf einmal.
* **Reine Zeitachse.** `WorkoutTimeline` ist ein Wertetyp ohne Zustand: rein
  kommt eine verstrichene Zeit, raus kommen Segment, Fortschritt und Zielwert.
  Die Segmentsuche ist binär, weil ein Tabata-Workout gut 40 Blöcke hat und das
  viermal pro Sekunde läuft.
* **Ratenbegrenzte Befehle.** Eine Rampe ändert das Ziel bei jedem Tick. An den
  Trainer geht höchstens ein Befehl pro Sekunde, plus alle fünf Sekunden eine
  Wiederholung, falls ein Paket verloren ging.

## Zustand und Beobachtung

Alles läuft auf `@MainActor` und nutzt `@Observable`. Die Datenmengen sind
winzig (ein Messpunkt pro Sekunde), die Bildschirmfrequenz gering – es gibt
keinen Grund für Hintergrund-Aktoren und ihre Synchronisationsfehler.

Eine Falle, die hier schon zugeschnappt ist: **unter `@Observable` darf ein
`didSet` dem eigenen Property nichts zuweisen.** Das Makro macht aus dem
gespeicherten Property ein berechnetes, die Zuweisung löst `didSet` erneut aus,
und der Stack läuft über. Werte werden deshalb in Setter-Methoden begrenzt
(`setIntensityBias(_:)`, `setFTP(_:)`), nicht in `didSet`.

## Speichern

Der Speicher ist bewusst ein Schlüssel-Wert-Laden hinter dem Protokoll
`KeyValueStorage`, weil tvOS die Latte setzt: dort gibt es kein beschreibbares
Dokumentverzeichnis, nur `UserDefaults` mit rund 500 kB.

| Plattform | Umsetzung | Sekundenverlauf |
|---|---|---|
| macOS, iOS | `FileStorage` (JSON in Application Support) | wird gespeichert |
| tvOS | `UserDefaultsStorage` | wird verworfen, nur Zusammenfassung bleibt |
| Tests | `InMemoryStorage` | nach Bedarf |

Die drei `@Observable`-Läden (`SettingsStore`, `WorkoutLibrary`, `SessionStore`)
schreiben bei jeder Änderung und laden beim Start. Für die Datenmengen hier ist
das völlig ausreichend; SwiftData bringt in dieser Größenordnung nur Kopplung.

## Konto und Abgleich

Die App läuft **vollständig ohne Konto**. Keine Funktion ist hinter der
Anmeldung versteckt: Programme bauen, fahren, auswerten geht lokal. Ein Konto
bringt genau eines dazu – dass alles auf dem Server liegt und auf jedem Gerät
und im Web-Portal auftaucht.

Drei Bausteine in `WattwerkCore/Sync`:

* **`APIClient`** – ein `actor` mit den HTTP-Aufrufen. Er kennt nur die Tokens,
  nicht den Anmeldezustand; dadurch ist er in Tests austauschbar, ohne die
  Anmeldelogik mitzuschleppen. Bei 401 frischt er **einmal** auf und wiederholt
  den Aufruf.
* **`AccountStore`** – wer angemeldet ist, Tokens und zwischengespeichertes
  Profil.
* **`SyncService`** – der Abgleich, an einer Stelle beschrieben statt über die
  App verteilt.

### Die Regel für Programme

```
hochschieben, wenn  syncedAt == nil            (noch nie abgeglichen)
                 || updatedAt > syncedAt       (seither lokal geändert)
danach gilt die Liste des Servers.
```

Das `syncedAt` je Programm ist der Grund, warum ein im Web gelöschtes Programm
auch wirklich verschwindet. Ohne es würde jedes Gerät, das die Datei noch hat,
sie beim nächsten Abgleich wieder hochladen – und das Programm wäre nicht
totzukriegen.

Einheiten wandern nur hoch und tragen dafür ein `uploadedAt`. Schlägt der
Upload fehl, bleibt die Einheit als ausstehend liegen und geht beim nächsten
Abgleich mit; verloren geht nichts.

Das Drahtformat steht **explizit** in `Sync/WorkoutPayload.swift` und
`packages/shared`, statt aus Swifts `Codable` zu fallen: Swift kodiert
Aufzählungen mit zugeordneten Werten als `{"steady":{"_0":…}}`, was von
TypeScript aus niemand lesen will und beim kleinsten Umbau am Swift-Modell
stillschweigend kippt.

Der mitgelieferte Katalog bleibt in der App (`BuiltInWorkouts`) **und** liegt in
der Datenbank – mit denselben Kennungen, erzeugt aus demselben Code. Offline ist
er damit da, online entstehen keine Dubletten, und ein Test vergleicht beide
Seiten.

## Oberfläche

Eine `RootView` für beide Plattformen. Der Unterschied ist klein und ehrlich
abgegrenzt:

* Mac: `NavigationSplitView` mit Seitenleiste, Werkzeugleisten, Editor.
* TV: `TabView`, kein Editor, Play/Pause auf der Fernbedienung.
* `Theme.scale` (1.0 bzw. 1.6) skaliert Schrift und Abstände, statt zwei
  Layouts zu pflegen.

Ein paar SwiftUI-Bausteine gibt es auf tvOS nicht (`Stepper`, `Slider`,
`fileExporter`). Statt überall `#if` zu streuen, gibt es Ersatzkomponenten wie
`ValueStepper`, die auf beiden Plattformen dasselbe tun.

## Tests

82 Tests, davon 76 ohne alles in Millisekunden:

* **Domäne** – Zeitachse an den Segmentgrenzen, Rampen, Zonen, TSS/NP/IF
  (eine Stunde an der Schwelle ergibt exakt 100 TSS), Bibliothek, Verlauf.
* **Engine** – Segmentwechsel, Pause, Springen, Intensitätsregler, gedeckelte
  Zeitsprünge, Befehlsratenbegrenzung, stehengebliebene Sensoren.
* **GATT-Parser** – echte Bytefolgen für Indoor Bike Data (inklusive des
  invertierten *More-Data*-Bits), Herzfrequenz, Control Point, Zählerüberläufe
  bei der Trittfrequenz, abgeschnittene Pakete.
* **Integration** – vollständige Fahrten gegen den Simulator: Zielverfolgung,
  Segmentwechsel, Freigabe bei freien Blöcken, plausible Auswertung.
* **Live-API** – der echte `APIClient` gegen einen laufenden Server. Übersprungen,
  solange `WATTWERK_API_URL` nicht gesetzt ist, damit `swift test` ohne Docker
  durchläuft:

  ```bash
  WATTWERK_API_URL=http://localhost:8088 swift test --filter Live
  ```

  Ihr Wert liegt darin, dass sie die Umwandlung zwischen Swift-Modell und
  Drahtformat gegen die echte Gegenstelle prüfen – Rampen, Trittfrequenz,
  absolute Watt, freie Blöcke – und dass der Katalog auf beiden Seiten derselbe
  ist. Eine Attrappe würde genau die Abweichung wegdefinieren, die hier
  auffallen soll.
