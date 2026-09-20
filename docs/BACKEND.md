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
| POST | `/auth/verifyEmail` | – | Adresse bestätigen (für Clients) |
| GET | `/auth/verify/:token` | – | Derselbe Weg als Seite, für den Link aus der Mail |
| GET | `/me` | ja | Fahrerprofil lesen |
| PUT | `/me` | ja | FTP, Puls, Gewicht, Name ändern |
| POST | `/sessions` | ja | Gefahrene Einheit hochladen |
| GET | `/sessions` | ja | Verlauf plus Wochenbelastung |
| DELETE | `/sessions/:id` | ja | Einheit löschen |
| GET | `/health` | – | Für Compose, Kubernetes, Monitoring |

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

Mailversand hängt noch nicht dran. Der Bestätigungslink landet außerhalb von
Produktion im Log, sodass der Weg lokal vollständig durchspielbar ist.

## Datenbank

Zwei Tabellen, `sql/V1__create_initial.sql`:

* **`user`** – Zugangsdaten plus Fahrerprofil (FTP, Maximalpuls, Ruhepuls,
  Gewicht). Dieselben Felder wie `RiderProfile` in der App, damit es keine
  zweite Wahrheit gibt.
* **`trainingSession`** – eine gefahrene Einheit, ohne die Sekundenspur. Der
  eindeutige Index auf `(userID, clientID)` macht den Upload wiederholbar: die
  App schickt eine Einheit nach einem Netzfehler erneut, und das darf den
  Verlauf nicht verdoppeln.

Änderungen kommen als neue Datei (`V1.1__…`); Flyway prüft die Prüfsummen der
bereits eingespielten.

Zwei Dinge, die beim Bauen aufgefallen sind und im Code stehen:

* MySQL kennt kein `RETURNING`. Die Instanz aus `upsert` trägt nur die
  übergebenen Werte – ohne `id`, `createdAt`, `updatedAt`. Deshalb wird nach dem
  Upsert noch einmal gelesen.
* Ein nie gesetztes Feld ist auf einer frisch angelegten Sequelize-Instanz
  `undefined`, nicht `null`. `emailVerifiedAt !== null` war damit immer wahr und
  hätte jedes neue Konto als bestätigt ausgewiesen.

## Landingpage

Vite, React, TypeScript; gebaut zu statischen Dateien, ausgeliefert von nginx.
Im Laufzeit-Image ist kein Node mehr.

Alle Aufrufe gehen relativ an `/api`. nginx leitet das an `API_URL` weiter, im
Entwicklungsmodus macht der Vite-Proxy dasselbe. Dadurch steht keine Adresse im
gebauten JavaScript, der Browser braucht kein CORS, und derselbe Build läuft
gegen jede API.

nginx reicht `X-Forwarded-For` durch. Ohne das zählte die Ratenbegrenzung alle
Registrierungen auf die IP des Proxys – ein Test hält das fest.

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
