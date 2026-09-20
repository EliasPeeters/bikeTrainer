# Wattwerk

Strukturiertes Indoor-Radtraining: Programme zusammenklicken, Smarttrainer per
Bluetooth steuern, jede Einheit aufzeichnen.

Das Repo hat drei Teile:

| Teil | Was | Stand |
|---|---|---|
| **Apps** | SwiftUI für macOS und tvOS, gemeinsames Swift-Package | Baut und läuft, am echten Trainer ungetestet |
| **API** | TypeScript, Express, Sequelize, MariaDB, Flyway | Läuft, Registrierung End-to-End geprüft |
| **Landingpage** | Vite, React, nginx – eigener Compose-Stack | Läuft, Registrierung über das Formular geprüft |

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

### Landingpage

```bash
docker compose -f docker-compose-landingpage.yml up --build
```

Danach liegt sie auf <http://localhost:8089> und registriert gegen die API.

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
├── packages/shared              API-Typen, von Backend und Landingpage genutzt
├── packages/backend             Express-API nach dem Vorbild des Livo-Backends
└── packages/landingpage         Vite, React, nginx

sql/                         Flyway-Migrationen
docker-compose.yml           API-Stack: db + flyway + backend
docker-compose-db-only.yml   Nur Datenbank und Migrationen
docker-compose-landingpage.yml   Landingpage als eigener Stack
```

Beide Seiten sind so geschnitten, dass die Hülle dünn ist: die Swift-Apps
bestehen aus je einer Datei mit `@main`, und `index.ts` verdrahtet nur Services.

Mehr dazu: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Apps) ·
[docs/BACKEND.md](docs/BACKEND.md) (API und Landingpage) ·
[docs/BLUETOOTH.md](docs/BLUETOOTH.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

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

**Konto und Verlauf.** Registrierung, Anmeldung, Token-Auffrischung,
Fahrerprofil und Upload gefahrener Einheiten mitsamt Wochenbelastung.

## Angenommen (ändere das, was nicht passt)

| Thema | Entscheidung | Warum |
|---|---|---|
| Name | **Wattwerk** | Deutsch, merkbar, passt zu Watt |
| Sprache | UI deutsch, Code englisch | Du schreibst deutsch, Code bleibt international lesbar |
| Protokoll | FTMS als Hauptweg | Herstellerneutral, kann als einziges Standardprotokoll ERG |
| Ziele | Relativ zur FTP | Programme überleben Formveränderungen |
| Editor | Nur Mac/iPad | Strukturierte Workouts mit der Fernbedienung zu tippen ist Quälerei |
| tvOS-Speicher | Nur Zusammenfassungen | Auf dem Apple TV gibt es kein beschreibbares Dokumentverzeichnis, nur ~500 kB `UserDefaults` |
| API-Umfang | Konto, Profil, Einheiten | Genau das, was die App heute hat |
| Sekundenspur | Nicht auf dem Server | Ein paar hundert Kilobyte pro Stunde, ohne Nutzen für Verlauf und Belastung. Wenn sie gebraucht wird, bekommt sie eine eigene Tabelle |

## Geprüft und nicht geprüft

**Geprüft.** Beide App-Targets bauen (Xcode 27, Swift 6), 76 Swift-Tests grün.
44 Backend-Tests grün, davon 26 gegen eine echte MariaDB. Der API-Stack fährt
mit `docker compose up` hoch, Flyway spielt das Schema ein, Registrierung,
Anmeldung und `/me` beantwortet der Container. Die Landingpage läuft als eigener
Stack und legt über ihr Formular ein Konto an – Erfolgs- und Fehlerfall im
Browser gesehen.

**Nicht geprüft.**

1. **Der D500 ist nie angefahren worden.** Die Umsetzung folgt der
   FTMS-Spezifikation. Ob dein Trainer sie spricht, siehst du unter *Geräte* am
   Abzeichen **FTMS**; sonst siehe [docs/BLUETOOTH.md](docs/BLUETOOTH.md).
2. **Die Apps sind nicht visuell geprüft.** Sie bauen, die Mac-App startet
   sauber – Screenshots waren hier nicht möglich.
3. **Kein Mailversand.** Der Bestätigungslink steht im Log.
4. **Keine App-Icons.** Die Asset-Kataloge sind angelegt, aber leer.
5. **Die App redet noch nicht mit der API.** Beide Seiten sind da, der Client
   in `WattwerkCore` fehlt.

## Lizenz

Noch keine gewählt.
