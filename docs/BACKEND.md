# API und Landingpage

## Woher die Struktur kommt

Das Backend ist bewusst nach dem Livo-Backend (`~/GitHub/app/packages/backend`)
gebaut, damit du dich hier nicht umgewöhnen musst:

* **`server.ts`** – eine `Server`-Klasse um Express herum, die Routen typisiert
  registriert. Ein Handler bekommt ein `Request`-Objekt und gibt eine `Response`
  zurück; er fasst Express nie direkt an.
* **Services mit `configure(server)`** – jeder Themenbereich ist eine Klasse,
  die ihre eigenen Routen anmeldet. `index.ts` baut die Services zusammen und
  verdrahtet sie, mehr nicht.
* **Transaktion pro Request** – über `cls-hooked` und `Sequelize.useCLS`, sodass
  kein Service eine Transaktion durch seine Aufrufkette reichen muss.
* **Sequelize-Modelle `DBxxx`** mit `Model.init` beim Laden des Moduls.
* **Flyway** – das Schema kommt aus `sql/`, nicht aus `sequelize.sync()`.

Der typisierte Routenaufruf sieht aus wie drüben:

```ts
server.route("/me", {authenticated: true, includeUser: true})
    .putJSON<UpdateProfileRequest, UserResponse>(async (request) => {
        await request.user.update({ftp: 265})   // request.user ist garantiert da
        return Response.json(200, request.user.toResponse())
    })
```

Die Optionen bestimmen den Typ des Requests: nur mit
`{authenticated: true, includeUser: true}` existiert `request.user`, und dann
ohne Optionalität. Wer den Nutzer braucht, bekommt ihn vom Compiler garantiert,
statt im Handler auf `undefined` zu prüfen.

### Was absichtlich anders ist

| Livo | Hier | Warum |
|---|---|---|
| `bcrypt` (nativ) | `bcryptjs` | Kein Compiler im Image, keine Neubauten bei jedem Node-Wechsel. Gleicher Algorithmus |
| Sentry, OpenTelemetry, Prometheus | nichts davon | Für einen ersten Wurf Ballast. Die Stellen dafür sind in `server.ts` offensichtlich |
| Fehler als Klartext (`Response.error`) | zusätzlich `failure(code, ApiErrorCode, text)` als JSON | Die Landingpage unterscheidet „E-Mail vergeben" von „Passwort zu kurz" am Code, nicht am Text – sonst bricht jede Umformulierung das Frontend |
| Profile, Mehrfachprofile, Chats … | nur Nutzer und Einheiten | Das ist der Stand, den die App braucht |
| MariaDB 10.7 | MariaDB 11.4 | Neuer Start, kein Grund zurückzugehen |

`Response.error` gibt es weiterhin und verhält sich wie drüben.

## Routen

| Methode | Route | Anmeldung | Zweck |
|---|---|---|---|
| POST | `/auth/register` | – | Konto anlegen, liefert Tokens |
| POST | `/auth/login` | – | Anmelden |
| POST | `/auth/refresh` | Token im Körper | Neue Tokens |
| GET | `/me` | ja | Fahrerprofil lesen |
| PUT | `/me` | ja | FTP, Puls, Gewicht, Name ändern |
| POST | `/me/delete` | ja | Konto endgültig löschen (Passwort im Körper) |
| GET | `/me/keys` | ja, **ohne Schlüssel** | Eigene Zugangsschlüssel |
| POST | `/me/keys` | ja, **ohne Schlüssel** | Schlüssel anlegen (der Schlüssel steht nur in dieser Antwort) |
| DELETE | `/me/keys/:id` | ja, **ohne Schlüssel** | Schlüssel zurücknehmen |
| POST | `/sessions` | ja | Gefahrene Einheit hochladen |
| GET | `/sessions` | ja | Verlauf plus Wochenbelastung |
| DELETE | `/sessions/:id` | ja | Einheit löschen |
| GET | `/workouts` | ja | Eigene Programme |
| POST | `/workouts` | ja | Anlegen oder ersetzen (Kennung vom Client) |
| PUT | `/workouts/:id` | ja | Ändern |
| DELETE | `/workouts/:id` | ja | Löschen |
| GET | `/workouts/:id` | – | Eigenes, öffentliches oder mitgeliefertes Programm |
| GET | `/workouts/public` | – | Suchen und stöbern (`query`, `tag`, Dauer) |
| POST | `/workouts/sync` | ja | Schwung lokaler Programme hochschieben |
| GET | `/collections` | ja | Eigene Ordner samt Inhalt |
| POST/PUT | `/collections[/:id]` | ja | Anlegen und ändern |
| DELETE | `/collections/:id` | ja | Löschen |
| POST | `/collections/:id/items` | ja | Programm hineinlegen |
| DELETE | `/collections/:id/items/:workoutID` | ja | Wieder herausnehmen |

Dieselben Routen liegen als Werkzeuge für Sprachmodelle bereit – siehe
[MCP.md](MCP.md).
| GET | `/discover` | optional | Die Reihen der Bibliothek |
| GET | `/health` | – | Für Compose, Kubernetes, Monitoring |

### Zugangsschlüssel

Ein Zugangstoken gilt fünfzehn Minuten, ein Auffrischungstoken 90 Tage. Für
eine eingetragene Verbindung – einen MCP-Server, ein Skript – taugt beides
nicht: das eine ist zu kurz, das andere lässt sich nur zurückziehen, indem man
`REFRESH_TOKEN_SECRET` wechselt und damit auch alle Apps aus der Anmeldung
wirft.

Ein Zugangsschlüssel (`wk_` plus 256 Bit Zufall, base64url) ist die Antwort
darauf. Er wird wie ein Zugangstoken geschickt:

```
Authorization: Bearer wk_WGSqRTW2ENrxJLvMkkxi-U1O83vshj3Kvri5CKPJ7mg
```

Gespeichert wird nur sein SHA-256 – kein bcrypt, weil ein Schlüssel nicht zu
erraten ist und bei *jedem* Aufruf nachgeschlagen wird; eine absichtlich
langsame Funktion wäre hier die Bremse für jeden Request.

Drei Grenzen sind eingezogen:

* **`scope: 'read'` darf nur GET.** Die Regel steht in `wrapRequest` und nicht
  in den Handlern – eine vergessene Prüfung gäbe sonst stillschweigend
  Schreibrecht, und genau das soll `read` ausschließen.
* **Ein Schlüssel verwaltet keine Schlüssel** (`allowApiKey: false`). Sonst
  verlängerte sich ein abgegriffener Schlüssel selbst, indem er einen zweiten
  anlegt, und das Zurücknehmen liefe ins Leere.
* **Ein Schlüssel löscht kein Konto.** Aus demselben Grund.

`lastUsedAt` wird höchstens stündlich nachgezogen. Bei jedem Aufruf zu
schreiben hieße, dass jede Leseanfrage ein Schreibvorgang ist – bei einem
Assistenten, der zehn Werkzeuge hintereinander aufruft, zehn Updates auf
dieselbe Zeile.

### Programme, Sichtbarkeit und Sammlungen

Ein Programm ist **privat, bis sein Urheber etwas anderes sagt**. Freigeben ist
eine Entscheidung, kein Standard.

* Fremde private Programme antworten mit **404, nicht 403** – alles andere
  verriete, dass es sie gibt.
* Der mitgelieferte Katalog gehört niemandem (`ownerUserID IS NULL`), ist immer
  öffentlich und lässt sich nicht ändern oder löschen. Wer ihn anpassen will,
  legt eine Kopie an.
* In eine Sammlung darf nur, was man auch sehen darf – sonst wäre sie ein Weg
  an fremde private Programme.
* Dauer und Belastung rechnet **der Server**, nicht der Client. Sonst hinge die
  Sortierung der Übersicht daran, was jemand mitschickt.

Eine **Sammlung** ist Ordner und Playlist in einem. Zwei Begriffe für dasselbe
wären zwei Datenmodelle, zwei Oberflächen und die Frage, warum ein Programm
nicht in beidem liegen darf. Sie hat eine Reihenfolge; wer sie als Ordner
benutzt, ignoriert sie.

### Die Reihen der Bibliothek

`/discover` liefert fertige Reihen – der Server entscheidet, welche es gibt und
wie sie heißen. App und Web-Portal zeichnen nur, was kommt; damit lässt sich an
den Empfehlungen drehen, ohne zwei Clients neu auszuliefern, und beide zeigen
garantiert dasselbe.

Es sind Heuristiken, keine gelernten Empfehlungen: es gibt noch keine
Nutzungsdaten, aus denen sich etwas lernen ließe. „Top-Tipps" zählt schlicht,
wie oft ein Programm gefahren wurde. Leere Reihen fallen weg – eine Überschrift
ohne Inhalt ist kein Angebot.

Angemeldet kommen „Zuletzt gefahren" und „Deine Programme" dazu. Ohne Konto
funktioniert der Endpunkt trotzdem, damit die Landingpage den Katalog zeigen
kann, bevor sich jemand registriert.

Fehler kommen immer in derselben Form:

```json
{"error": "EMAIL_TAKEN", "message": "Für diese Adresse gibt es schon ein Konto."}
```

Die Codes stehen als Typ in `@wattwerk/shared`, sind also auf beiden Seiten
dieselben.

## Anmeldung

Zwei Tokens mit **verschiedenen Geheimnissen**: ein Zugangstoken (15 Minuten)
und ein Auffrischungstoken (90 Tage). Getrennte Geheimnisse, weil sich sonst ein
90 Tage gültiges Auffrischungstoken direkt als Zugangstoken verwenden ließe und
die kurze Laufzeit wirkungslos wäre. Ein Test hält genau das fest.

Weitere Entscheidungen, die im Code kommentiert sind:

* **Anmeldung verrät nicht, wer registriert ist.** Falsches Passwort und
  unbekannte Adresse geben dieselbe Antwort, und bei unbekannter Adresse wird
  trotzdem gegen einen Platzhalter-Hash geprüft – sonst wäre schon die Antwortzeit
  ein Verzeichnis registrierter Adressen.
* **Adressen werden normalisiert** (getrimmt, klein) gespeichert. Ohne das legen
  `Max@…` und `max@…` zwei Konten an, und der eindeutige Index verhindert es nicht.
* **Ratenbegrenzung** auf `/auth/register` und `/auth/login`, je IP, im
  Arbeitsspeicher. Über `REGISTER_RATE_LIMIT` und `LOGIN_RATE_LIMIT` einstellbar.
  Mit mehreren Instanzen gilt das Kontingent je Prozess – eine Bremse, keine Mauer.
* **Passwörter über 72 Byte werden abgelehnt**, statt sie von bcrypt
  stillschweigend abschneiden zu lassen.
* **Löschen verlangt das Passwort erneut.** Ein abgegriffenes Zugangstoken soll
  nicht reichen, um ein Konto samt aller Einheiten zu entfernen. Es ist ein POST
  und kein DELETE, weil ein Körper mitgeht und den nicht jeder Proxy durchreicht.
  Einheiten, Programme und Sammlungen hängen per Fremdschlüssel mit
  `ON DELETE CASCADE` am Konto - auch öffentlich geteilte Programme gehen mit,
  denn "gelöscht" soll gelöscht heißen. Ohne das gibt es keine Freigabe im App
  Store: Richtlinie 5.1.1(v) verlangt, dass ein in der App angelegtes Konto dort
  auch wieder wegkann.

**Keine Mailbestätigung.** Es gibt keinen Mailversand, und Spalten, die nie
einen Wert bekommen, laden nur dazu ein, sich auf sie zu verlassen – die
Bestätigung ist mit Migration V2 wieder ausgebaut worden. Registrieren heißt
E-Mail und Passwort, mehr nicht.

## Datenbank

`sql/V1__create_initial.sql` und `sql/V2__accounts_workouts_collections.sql`:

* **`user`** – Zugangsdaten plus Fahrerprofil (FTP, Maximalpuls, Ruhepuls,
  Gewicht). Dieselben Felder wie `RiderProfile` in der App, damit es keine
  zweite Wahrheit gibt.
* **`trainingSession`** – eine gefahrene Einheit, ohne die Sekundenspur. Der
  eindeutige Index auf `(userID, clientID)` macht den Upload wiederholbar: die
  App schickt eine Einheit nach einem Netzfehler erneut, und das darf den
  Verlauf nicht verdoppeln.

* **`workout`** – Segmente und Schlagworte als JSON. Die Datenbank muss nie in
  sie hineinsehen, und eine eigene Tabelle je Block wäre ein Join pro Kachel in
  einer Übersicht, die dreißig Programme gleichzeitig zeigt.
* **`collection`** und **`collectionItem`** – Ordner und ihr Inhalt, mit
  Reihenfolge.

Der mitgelieferte Katalog wird in V2 **aus `BuiltInWorkouts` in WattwerkCore
erzeugt** und mit denselben Kennungen eingespielt. Lädt jemand seine Bibliothek
herunter, entstehen deshalb keine Dubletten neben dem lokalen Katalog – ein
Swift-Test vergleicht beide Seiten Feld für Feld.

Änderungen kommen als neue Datei (`V2.1__…`); Flyway prüft die Prüfsummen der
bereits eingespielten.

Zwei Dinge, die beim Bauen aufgefallen sind und im Code stehen:

* MySQL kennt kein `RETURNING`. Die Instanz aus `upsert` trägt nur die
  übergebenen Werte – ohne `id`, `createdAt`, `updatedAt`. Deshalb wird nach dem
  Upsert noch einmal gelesen.
* Ein nie gesetztes Feld ist auf einer frisch angelegten Sequelize-Instanz
  `undefined`, nicht `null`. `emailVerifiedAt !== null` war damit immer wahr und
  hätte jedes neue Konto als bestätigt ausgewiesen.

## Landingpage und Web-Portal

Vite, React, TypeScript; gebaut zu statischen Dateien, ausgeliefert von nginx.
Im Laufzeit-Image ist kein Node mehr.

Zwei Teile in einer Anwendung:

* **`/`** – die Seite für Leute ohne Konto, mit Registrierung und Anmeldung.
* **`/app/…`** – das Portal: Übersicht mit Wochenbelastung und letzten
  Einheiten, Bibliothek mit denselben Reihen wie die App, Programm-Editor,
  Ordner, Verlauf und Profil.

nginx liefert für jede Route `index.html` aus (`try_files … /index.html`), sonst
endete ein Neuladen auf `/app/bibliothek` im 404 des Webservers statt im Router.

Die Tokens liegen in `localStorage`, jeder Zugriff darauf in `try/catch`: im
privaten Modus mancher Browser wirft es, statt nur leer zu sein. Läuft das
Zugangstoken ab, frischt der Client **einmal** auf und wiederholt den Aufruf –
scheitert auch der zweite Versuch, ist die Sitzung wirklich vorbei, und eine
Schleife aus Auffrischen und Scheitern würde nur den Server beschäftigen.

Alle Aufrufe gehen relativ an `/api`. nginx leitet das an `API_URL` weiter, im
Entwicklungsmodus macht der Vite-Proxy dasselbe. Dadurch steht keine Adresse im
gebauten JavaScript, der Browser braucht kein CORS, und derselbe Build läuft
gegen jede API.

nginx reicht `X-Forwarded-For` durch. Ohne das zählte die Ratenbegrenzung alle
Registrierungen auf die IP des Proxys – ein Test hält das fest.

## Die Apps ans Backend hängen

Zwei Dinge auf Apple-Seite, ohne die keine Verbindung zustande kommt – beide
scheitern lautlos und sehen von innen aus, als wäre der Server aus:

* **`com.apple.security.network.client`** in `Apps/Mac/Wattwerk.entitlements`.
  Die Mac-App läuft in der Sandbox; ohne dieses Recht blockiert macOS jede
  ausgehende Verbindung.
* **`NSAllowsLocalNetworking`** in `Apps/Config/{Mac,TV}-Info.plist`. App
  Transport Security verbietet unverschlüsseltes HTTP. Die Ausnahme gilt nur
  für loopback, `*.local` und private Adressbereiche – genau der Fall „API auf
  dem Mac, Apple TV im selben Netz". Alles im Internet muss weiterhin HTTPS sein.

Die Serveradresse steht in `APIEnvironment.defaultBaseURL`. In Debug-Bauten
lässt sie sich unter *Konto* umstellen; in einem Auslieferbau ist das Feld nicht
da, weil es dort kein Werkzeug wäre, sondern eine Möglichkeit, die App
kaputtzukonfigurieren.

## Betrieb

Umgebungsvariablen: siehe `.env.example` und `packages/backend/src/config/env.ts`.
Alles hat einen Standardwert, damit der lokale Start ohne `.env` funktioniert.

Mit `NODE_ENV=production` verweigert der Server den Start, solange noch
Entwicklungs-Geheimnisse gesetzt sind (`assertProductionConfig`). Ein
Zugangstoken, dessen Schlüssel im Repository steht, ist kein Zugangstoken – und
es fällt sonst erst auf, wenn es jemand ausnutzt.

## Tests

44 Tests, `yarn backend:test`:

* **Unit** (18) – Eingabeprüfung, Ratenbegrenzung, Tokens, Passwort-Hashing.
  Laufen ohne alles.
* **Integration** (26) – gegen eine echte MariaDB mit dem von Flyway erzeugten
  Schema, über `supertest` gegen genau die Verdrahtung aus `createServer()`.
  Bewusst keine Attrappe der Datenbank: die interessanten Fehler dieser Schicht
  sind genau die, die eine Attrappe wegdefiniert – ein eindeutiger Index, ein
  Fremdschlüssel, eine Spalte, die es im Schema gar nicht gibt.

Die Integrationstests leeren die Tabellen nicht zwischendurch. Jeder Test legt
seinen eigenen Nutzer an und prüft nur dessen Daten, so wie die API es im
Betrieb auch tut; ein gemeinsames Leeren wäre ein Rennen zwischen parallel
laufenden Testdateien.

Voraussetzung: `docker compose -f docker-compose-db-only.yml up -d`.
