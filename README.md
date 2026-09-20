# Wattwerk

Strukturiertes Indoor-Radtraining: Programme zusammenklicken, Smarttrainer per
Bluetooth steuern, jede Einheit aufzeichnen.

Das Repo hat drei Teile:

| Teil | Was | Stand |
|---|---|---|
| **Apps** | SwiftUI für macOS und tvOS, gemeinsames Swift-Package | Baut und läuft, am echten Trainer ungetestet |
| **API** | TypeScript, Express, Sequelize, MariaDB, Flyway | Läuft, End-to-End geprüft |
| **Web-Portal** | Vite, React, nginx – eigener Compose-Stack | Läuft, im Browser durchgespielt |

Mit Konto liegt alles in der Cloud und ist auf jedem Gerät gleich. **Ohne Konto
funktioniert die App vollständig** – keine Funktion ist hinter der Anmeldung
versteckt.

---

## Schnellstart

### Apps

```bash
open Apps/Wattwerk.xcodeproj
```

Schema **Wattwerk (Mac)** wählen, ⌘R. Dann links auf **Geräte** → **Simulator**
einschalten (kein Rad nötig), auf **Training** → Programm wählen →
**Einheit starten**.

```bash
swift test
```

### API

```bash
docker compose up --build
```

Danach antwortet die API auf <http://localhost:8088/health>. Ein Konto anlegen:

```bash
curl -X POST http://localhost:8088/auth/register -H "Content-Type: application/json" -d '{"email":"du@example.com","password":"geheim12"}'
```

### Web-Portal

```bash
docker compose -f docker-compose-landingpage.yml up --build
```

Danach liegt es auf <http://localhost:8089>: Startseite mit Registrierung und
Anmeldung, dahinter unter `/app` das Portal mit Übersicht, Bibliothek,
Programm-Editor, Ordnern, Verlauf und Profil.

### Alles zusammen ausprobieren

1. **Stack hochfahren** – `docker compose up --build` (API auf 8088) und
   `docker compose -f docker-compose-landingpage.yml up --build` (Portal auf 8089).
2. **Im Portal** ein Konto anlegen, ein Programm bauen, veröffentlichen.
3. **In der App** (⌘R in Xcode) unter *Konto* mit denselben Daten anmelden. Das
   im Web gebaute Programm steht danach unter *Training*.
4. **Fahren**: *Geräte* → Simulator einschalten, Einheit starten und
   durchlaufen lassen. Sie taucht im Portal unter *Verlauf* auf und in der
   Bibliothek unter „Zuletzt gefahren".
5. **Andersherum**: in der App ein Programm bauen, *Öffentlich teilen* – es
   erscheint im Portal unter *Entdecken*.

Für den **Apple TV** muss in `APIEnvironment.defaultBaseURL` die IP des Macs
stehen statt `localhost` (etwa `http://192.168.1.20:8088`) – der Fernseher hat
kein eigenes `localhost`, auf dem die API läuft. Im tvOS-Simulator geht
`localhost`, weil er sich das Netz des Macs teilt.

### Am Backend arbeiten

```bash
docker compose -f docker-compose-db-only.yml up -d
yarn install
yarn backend:start
yarn backend:test
```

Die Host-Ports sind über `API_PORT`, `DB_PORT` und `LANDINGPAGE_PORT`
überschreibbar – 8080 und 3306 sind auf Entwicklungsrechnern selten frei. Siehe
`.env.example`.

## Aufbau

```
Package.swift                Swift-Package WattwerkKit
├── Sources/WattwerkCore         Workouts, Ride-Engine, Metriken, Speicher
├── Sources/WattwerkBluetooth    FTMS-Trainer, Pulsgurt, Simulator
└── Sources/WattwerkUI           Oberfläche, geteilt von Mac und TV
Apps/Wattwerk.xcodeproj      Targets: Wattwerk (macOS 14+), WattwerkTV (tvOS 17+)

package.json                 Yarn-Workspace
├── packages/shared              API-Typen, von Backend und Web-Portal genutzt
├── packages/backend             Express-API nach dem Vorbild des Livo-Backends
└── packages/landingpage         Landingpage und Web-Portal (Vite, React, nginx)

sql/                         Flyway-Migrationen
docker-compose.yml           API-Stack: db + flyway + backend
docker-compose-db-only.yml   Nur Datenbank und Migrationen
docker-compose-landingpage.yml   Landingpage als eigener Stack
```

Beide Seiten sind so geschnitten, dass die Hülle dünn ist: die Swift-Apps
bestehen aus je einer Datei mit `@main`, und `index.ts` verdrahtet nur Services.

Mehr dazu: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Apps) ·
[docs/BACKEND.md](docs/BACKEND.md) (API und Web-Portal) ·
[docs/BLUETOOTH.md](docs/BLUETOOTH.md) ·
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (VPS und Pipeline) ·
[docs/RELEASE.md](docs/RELEASE.md) (App Store) ·
[docs/ROADMAP.md](docs/ROADMAP.md)

## Was drin ist

**Programme.** Elf mitgelieferte Einheiten (Sweet Spot, Over-Unders, VO2max,
30/30er, Tabata, Pyramide, Kadenzspiel, Rampentest …). Eigene Programme legst du
im Editor an: Blöcke mit Dauer und Ziel, konstant oder als Rampe, wahlweise in
Prozent der FTP oder in Watt, dazu ein Generator für Intervallserien. Ziele
stecken standardmäßig relativ zur FTP – ändert sich die FTP, skalieren alle
Programme mit.

**Fahren.** Großer Fahrtbildschirm: aktuelle Leistung gegen Ziel (Farbe zeigt
die Abweichung), Restzeit im Block, nächster Block, Trittfrequenz mit
Zielkorridor, Puls, Ø/NP/kJ, Profil mit Laufmarke. Pause, Block vor/zurück und
ein Intensitätsregler (±5 %), der die Vorgabe live skaliert.

**Trainer.** FTMS (0x1826): Indoor Bike Data lesen, Control Point schreiben,
also echte ERG-Steuerung. Fällt auf Cycling Power (0x1818) zurück, wenn der
Trainer kein FTMS kann – dann wird das Ziel nur angezeigt. Pulsgurt über den
Heart Rate Service (0x180D). Zuletzt benutzte Geräte verbinden sich beim Start
wieder.

**Konto, wenn man will.** Registrieren mit E-Mail und Passwort – in der App und
im Web. Danach gleichen sich Programme, Ordner, Fahrerprofil und gefahrene
Einheiten ab. Ohne Konto bleibt alles lokal und nichts fehlt.

**Bibliothek wie ein Streaming-Dienst.** Die Übersicht besteht aus Reihen:
„Zuletzt gefahren", „Deine Programme", „Top-Tipps", „Kurz und knackig", „Aus dem
Katalog". Welche es gibt, entscheidet der Server – App und Portal zeigen
dasselbe. Ohne Konto oder ohne Netz werden sie lokal gebaut.

**Teilen und Sammeln.** Eigene Programme sind privat und lassen sich
veröffentlichen; öffentliche findet man über Suche und die Reihen und kopiert
sie in die eigene Bibliothek. Ordner fassen Programme zusammen – Ordner und
Playlist sind dabei dasselbe, mit Reihenfolge.

## Angenommen (ändere das, was nicht passt)

| Thema | Entscheidung | Warum |
|---|---|---|
| Name | **Wattwerk** | Deutsch, merkbar, passt zu Watt |
| Sprache | UI deutsch, Code englisch | Du schreibst deutsch, Code bleibt international lesbar |
| Protokoll | FTMS als Hauptweg | Herstellerneutral, kann als einziges Standardprotokoll ERG |
| Ziele | Relativ zur FTP | Programme überleben Formveränderungen |
| Editor | Nur Mac/iPad | Strukturierte Workouts mit der Fernbedienung zu tippen ist Quälerei |
| tvOS-Speicher | Nur Zusammenfassungen | Auf dem Apple TV gibt es kein beschreibbares Dokumentverzeichnis, nur ~500 kB `UserDefaults` |
| API-Umfang | Konto, Profil, Einheiten, Programme, Ordner | Genau das, was App und Portal brauchen |
| Anmeldung | E-Mail und Passwort, keine Mailbestätigung | Es gibt keinen Mailversand, und eine Spalte ohne Wert lädt nur dazu ein, sich auf sie zu verlassen |
| Sichtbarkeit | Privat, bis freigegeben | Teilen ist eine Entscheidung, kein Standard |
| Ordner und Playlists | Ein Begriff: Sammlung | Zwei wären zwei Datenmodelle und die Frage, warum ein Programm nicht in beidem liegen darf |
| Empfehlungen | Heuristiken, keine gelernten | Es gibt noch keine Nutzungsdaten, aus denen sich etwas lernen ließe |
| Sekundenspur | Nicht auf dem Server | Ein paar hundert Kilobyte pro Stunde, ohne Nutzen für Verlauf und Belastung. Wenn sie gebraucht wird, bekommt sie eine eigene Tabelle |

## Geprüft und nicht geprüft

**Geprüft.** Beide App-Targets bauen (Xcode 27, Swift 6), 82 Swift-Tests grün.
70 Backend-Tests grün, davon 52 gegen eine echte MariaDB. Der API-Stack fährt
mit `docker compose up` hoch, Flyway spielt beide Migrationen ein. Im Browser
durchgespielt: registrieren, Programm mit Intervallserie bauen, speichern,
veröffentlichen. Und sechs Swift-Tests fahren den echten `APIClient` gegen den
laufenden Server – inklusive der Prüfung, dass der Katalog in App und Datenbank
Feld für Feld derselbe ist.

**Nicht geprüft.**

1. **Der D500 ist nie angefahren worden.** Die Umsetzung folgt der
   FTMS-Spezifikation. Ob dein Trainer sie spricht, siehst du unter *Geräte* am
   Abzeichen **FTMS**; sonst siehe [docs/BLUETOOTH.md](docs/BLUETOOTH.md).
2. **Die Apps sind nicht visuell geprüft.** Sie bauen, die Mac-App startet
   sauber – Screenshots waren hier nicht möglich. Das Web-Portal schon.
3. **Kein Mailversand**, also auch kein „Passwort vergessen".
4. **Sammlungen legt man im Web an.** In der App werden sie angezeigt und
   lassen sich fahren, aber nicht bearbeiten.
5. **Tokens liegen im App-Speicher, nicht im Schlüsselbund.**

## Lizenz

Noch keine gewählt.
