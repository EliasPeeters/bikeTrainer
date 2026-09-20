# MCP-Server

`packages/mcp` macht die Wattwerk-API als Werkzeuge für Sprachmodelle
verfügbar. Damit kann ein Assistent dasselbe wie App und Web-Portal: den
Verlauf lesen, die Bibliothek durchsuchen, Programme anlegen und ändern,
Sammlungen pflegen, das Fahrerprofil sehen.

Er spricht das [Model Context Protocol](https://modelcontextprotocol.io) über
**stdio** – der Client (Claude Desktop, Claude Code, …) startet ihn als
Unterprozess. Ein eigener Port, eine eigene Datenbank oder ein eigener
Container sind dafür nicht nötig.

## Was er ist und was nicht

Der Server ist eine dünne Hülle um die HTTP-API, mehr nicht. Jedes Werkzeug
ist ein Aufruf gegen eine Route aus [BACKEND.md](BACKEND.md) – es gibt hier
keine zweite Geschäftslogik, die mit der API auseinanderlaufen könnte, und
keine eigene Datenbankverbindung. Was die API ablehnt, lehnt der MCP-Server
ab, mit demselben Satz.

## Einrichten

```bash
yarn install
yarn mcp:build
```

Danach in die Konfiguration des Clients eintragen – für **Claude Desktop** in
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wattwerk": {
      "command": "node",
      "args": ["/PFAD/ZU/bikeTrainer/packages/mcp/dist/stdio.js"],
      "env": {
        "WATTWERK_API_URL": "http://localhost:8088",
        "WATTWERK_EMAIL": "du@example.com",
        "WATTWERK_PASSWORD": "geheim12"
      }
    }
  }
}
```

Für **Claude Code** dasselbe in einem Aufruf:

```bash
claude mcp add wattwerk \
  --env WATTWERK_API_URL=http://localhost:8088 \
  --env WATTWERK_EMAIL=du@example.com \
  --env WATTWERK_PASSWORD=geheim12 \
  -- node /PFAD/ZU/bikeTrainer/packages/mcp/dist/stdio.js
```

Das gebaute Bündel ist Absicht und nicht nur Bequemlichkeit: `yarn` schreibt
seine eigenen Zeilen (`yarn run v1.22.22`, `$ ts-node …`, `Done in 1.04s.`) auf
**stdout** – und genau darüber läuft das Protokoll. Ein `yarn mcp:start` als
Befehl zerlegt die Verbindung, bevor das erste Werkzeug auftaucht.

Zum Entwickeln geht es ohne Bauen mit `ts-node`, dann muss das
Arbeitsverzeichnis aber auf `packages/mcp` stehen – sonst findet `ts-node`
die passende `tsconfig.json` nicht:

```json
{
  "command": "npx",
  "args": ["ts-node", "/PFAD/ZU/bikeTrainer/packages/mcp/src/index.ts"],
  "cwd": "/PFAD/ZU/bikeTrainer/packages/mcp"
}
```

Nicht jeder Client kennt `cwd`. Im Zweifel `yarn mcp:build` und das Bündel
nehmen.

### Umgebung

| Variable | Standard | Zweck |
|---|---|---|
| `WATTWERK_API_URL` | `http://localhost:8088` | Adresse der API |
| `WATTWERK_API_KEY` | – | **Der empfohlene Weg.** Zugangsschlüssel aus dem Portal |
| `WATTWERK_EMAIL` | – | Konto, mit dem gearbeitet wird |
| `WATTWERK_PASSWORD` | – | Passwort dazu |
| `WATTWERK_REFRESH_TOKEN` | – | Statt E-Mail und Passwort |
| `WATTWERK_ACCESS_TOKEN` | – | Nur für kurze Läufe – gilt 15 Minuten |
| `WATTWERK_TIMEOUT_MS` | `20000` | Geduld mit der API |

**Zugangsschlüssel sind der beste Weg.** Im Web-Portal unter *Profil →
Zugangsschlüssel* auf „Schlüssel anlegen", den Wert kopieren, als
`WATTWERK_API_KEY` eintragen. Er läuft nicht ab, lässt sich einzeln
zurücknehmen und kann auf Lesen beschränkt werden – anders als das Passwort,
das vollen Zugriff gibt und in einer Konfigurationsdatei nichts zu suchen hat.

Ohne Zugangsdaten startet der Server trotzdem; nutzbar sind dann die
öffentlichen Werkzeuge (`search_workouts`, `get_workout`, `browse_library`,
`api_health`). Alles andere antwortet mit einem Hinweis statt mit einem Fehler
aus dem Nichts.

Wer sein Passwort nicht in eine Client-Konfiguration schreiben will, hinterlegt
ein Auffrischungstoken (`refreshToken` aus `/auth/login`). Es gilt 90 Tage und
lässt sich zurückziehen, indem das Token-Geheimnis der API gewechselt wird.
Liegt ein Passwort vor, meldet sich der Server nach einem abgelaufenen Token
selbst neu an – genau einmal je Aufruf, sonst würde aus einem falschen Passwort
eine Schleife gegen die Ratenbegrenzung.

## Werkzeuge

**Programme**

| Werkzeug | Route | Zweck |
|---|---|---|
| `list_my_workouts` | `GET /workouts` | Eigene Programme |
| `search_workouts` | `GET /workouts/public` | Öffentliche Programme und Katalog durchsuchen |
| `get_workout` | `GET /workouts/:id` | Ein Programm mit allen Blöcken (`raw: true` liefert JSON) |
| `create_workout` | `POST /workouts` | Neues Programm |
| `update_workout` | `PUT /workouts/:id` | Eigenes Programm vollständig ersetzen |
| `delete_workout` | `DELETE /workouts/:id` | Löschen |
| `import_workouts` | `POST /workouts/sync` | Bis zu 200 Programme auf einmal |
| `browse_library` | `GET /discover` | Die Reihen der Bibliothek |

**Sammlungen**

| Werkzeug | Route |
|---|---|
| `list_collections` | `GET /collections` |
| `create_collection` | `POST /collections` |
| `update_collection` | `PUT /collections/:id` |
| `delete_collection` | `DELETE /collections/:id` |
| `add_workout_to_collection` | `POST /collections/:id/items` |
| `remove_workout_from_collection` | `DELETE /collections/:id/items/:workoutID` |

**Verlauf und Profil**

| Werkzeug | Route | Zweck |
|---|---|---|
| `list_sessions` | `GET /sessions` | Gefahrene Einheiten plus Wochenbelastung |
| `log_session` | `POST /sessions` | Einheit nachtragen |
| `delete_session` | `DELETE /sessions/:id` | Einheit löschen |
| `get_profile` | `GET /me` | FTP, Gewicht, Herzfrequenzen |
| `update_profile` | `PUT /me` | Dieselben Werte ändern |
| `api_health` | `GET /health` | Läuft die API? |

### Was absichtlich fehlt

`POST /auth/register` und `POST /me/delete` haben kein Werkzeug. Ein Konto
anzulegen ergibt von hier aus keinen Sinn – der Server braucht die Zugangsdaten
schon zum Start. Und ein Werkzeug, das auf Zuruf das Konto samt aller Programme
und Einheiten unwiderruflich löscht, ist ein Missgeschick, das darauf wartet zu
passieren. Beides geht weiterhin über die API selbst.

## Antwortformat

Listen kommen als lesbare Zeilen, nicht als JSON:

```
3 Treffer

- Sweet Spot 3×12 — 1:05:00 · 78 TSS · öffentlich · von Elias · #Schwelle
  id: 2d5605f1-4e29-4027-8551-63bcb6fdf8f1
```

Das ist kein Geschmack, sondern Sparsamkeit: eine Bibliothek mit vierzig
Programmen wäre als JSON ein paar hunderttausend Zeichen Blöcke, von denen der
Aufrufer fast nichts braucht. Die Kennung steht deshalb in jeder Zeile – ohne
sie ist kein zweiter Aufruf möglich.

Wer die Blöcke wirklich braucht – etwa um ein Programm zu ändern –, holt es
einzeln mit `get_workout` und `raw: true`. Das liefert genau das JSON, das
`update_workout` wieder entgegennimmt.

Gleiche Blöcke hintereinander werden zusammengezogen: `8× 0:30 @ 150 % FTP`
statt achtmal derselben Zeile.

Fehler der API sind Antworten, keine Abstürze: sie kommen als Werkzeugfehler
mit Code und Satz zurück (`NOT_FOUND: Dieses Programm gibt es nicht.`). Würde
hier eine Ausnahme durchgereicht, stünde im Client nur „MCP error -32603" – und
gerade der Satz ist die Information, aus der sich der nächste Schritt ableiten
lässt.

## Als Dienst auf dem Server (HTTP)

Neben stdio kann derselbe Server über HTTP laufen – als Container im
Produktionsstack, erreichbar unter `https://mcp.wattwerk.eliaspeeters.de/mcp`.
Der Unterschied ist nicht der Transport, sondern die Anmeldung.

Bei stdio gehört der Prozess einem Menschen, und seine Zugangsdaten stehen in
der Umgebung. Über HTTP kann jeder anklopfen. Deshalb gilt dort:

* **Jeder Aufruf bringt sein eigenes Token mit**, als
  `Authorization: Bearer wk_…`. Der Dienst speichert keine Zugangsdaten –
  weder in der Umgebung noch zwischen zwei Aufrufen.
* **Ohne Token gibt es nichts**, auch nicht die öffentlichen Werkzeuge. Wer den
  Katalog ohne Konto lesen will, fragt die API direkt; dafür braucht es keinen
  MCP-Server.
* **Jeder Aufruf steht für sich.** Es gibt keine Sitzungen: ein Aufruf, ein
  frischer Server, ein Token, fertig. Eine Sitzungsverwaltung wäre ein
  Behälter, in dem fremde Tokens nebeneinander liegen – und der bei jedem
  Neustart des Containers ohnehin leer wäre.

Das Token ist ein **Auffrischungstoken** (`refreshToken` aus
`POST /auth/login`), kein Zugangstoken: ein Zugangstoken gilt fünfzehn Minuten,
was für eine eingetragene Verbindung unbrauchbar ist. Der Dienst tauscht es bei
jedem Aufruf gegen ein frisches Zugangstoken. Zurückziehen lässt es sich, indem
`REFRESH_TOKEN_SECRET` der API gewechselt wird – das wirft allerdings auch alle
Apps aus der Anmeldung.

### Eintragen

```bash
TOKEN=$(curl -s -X POST https://api.wattwerk.eliaspeeters.de/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"du@example.com","password":"geheim12"}' | jq -r .refreshToken)

claude mcp add --transport http wattwerk-live \
  https://mcp.wattwerk.eliaspeeters.de/mcp \
  --header "Authorization: Bearer $TOKEN"
```

### Was damit nicht geht

Als **eigener Connector auf claude.ai** taugt der Dienst so nicht: dort gibt es
im Formular nur OAuth Client ID und Secret, kein Feld für einen festen Header.
Dafür müsste der Server den OAuth-Teil der MCP-Spezifikation sprechen –
Autorisierungsserver, dynamische Client-Registrierung, Zustimmungsseite. Das
ist ein eigener Bau, keine Einstellung. Mit Claude Code und allem, was einen
eigenen Header erlaubt, funktioniert er.

### Betrieb

| Variable | Standard | Zweck |
|---|---|---|
| `WATTWERK_MCP_PORT` | `8090` | Port, auf dem der Dienst lauscht |
| `WATTWERK_MCP_ALLOWED_ORIGINS` | leer | Browser-Herkünfte, kommagetrennt. Leer heißt keine |
| `WATTWERK_API_URL` | – | Im Stack `http://backend:8080`, also im internen Netz |

Es gibt zwei Adressen: `POST /mcp` für das Protokoll und `GET /health` für
Compose und den Monitor. `/health` kommt ohne Token aus – eine
Bereitschaftsprüfung kann keine Zugangsdaten haben, und ein 401 wäre als Signal
unbrauchbar.

Lokal ausprobieren:

```bash
WATTWERK_API_URL=http://localhost:8088 yarn workspace @wattwerk/mcp serve
```

Ausgeliefert wird er mit dem übrigen Stack, siehe
[DEPLOYMENT.md](DEPLOYMENT.md) – dort steht auch der dritte Proxy Host. Der
DNS-Name ist bereits durch den Wildcard-Eintrag auf `*.wattwerk.eliaspeeters.de`
abgedeckt; es braucht keinen eigenen Eintrag.

## OAuth: verbinden ohne Schlüssel

Für ChatGPT und die Connectors auf claude.ai reicht ein Zugangsschlüssel nicht:
dort gibt es kein Feld dafür, sondern nur „Verbinden". Dahinter liegt OAuth.
Der Nutzer klickt, landet auf einer Wattwerk-Seite, meldet sich mit dem Konto
an, das er ohnehin hat, erlaubt den Zugriff – und bekommt nie ein Token zu
sehen.

**Der MCP-Server ist dabei der Resource Server, die API der
Autorisierungsserver.** Die Nutzer liegen ohnehin in der API; einen zweiten Ort
für Identitäten aufzumachen wäre die schlechtere Antwort.

### Was wo liegt

| Dokument | Wo | Wozu |
|---|---|---|
| `/.well-known/oauth-protected-resource` | MCP-Server | Verweist auf den Autorisierungsserver (RFC 9728) |
| `/.well-known/oauth-authorization-server` | API | Endpunkte und Fähigkeiten (RFC 8414) |
| `/oauth/authorize` | API | Anmeldung und Zustimmung, als HTML-Seite |
| `/oauth/token` | API | Code gegen Tokens, und Auffrischen |
| `/oauth/register` | API | Dynamic Client Registration |

Der Weg beginnt bei einem 401 des MCP-Servers. Dessen `WWW-Authenticate`-Header
trägt `resource_metadata="…"` – ohne diesen Verweis fände ein Client den
Autorisierungsserver nicht und meldete nur, dass etwas nicht ging.

### Was umgesetzt ist

* **Authorization Code mit PKCE**, nur `S256`. `plain` wäre PKCE, das nichts
  schützt.
* **Client ID Metadata Documents**: eine HTTPS-URL als `client_id`, hinter der
  das Metadatendokument des Clients liegt. Es wird bei Bedarf geholt und
  geprüft (`client_id` muss der URL entsprechen), zehn Minuten
  zwischengespeichert. Das ist der vorgesehene Weg – es entsteht keine Kopie,
  die veralten kann.
* **Dynamic Client Registration** als Rückfallebene. Offiziell veraltet, aber
  noch das, was viele Clients tun.
* **Tokens an den Empfänger gebunden** (RFC 8707): das Zugangstoken trägt die
  Adresse des MCP-Servers in `aud`, und der lehnt alles ab, was nicht für ihn
  ausgestellt wurde.
* **Auffrischungstokens rotieren.** Jedes Auffrischen tauscht das Token aus;
  taucht das alte noch einmal auf, ist es abgegriffen – und die Verbindung ist
  dann ohnehin schon geschlossen.
* **`iss` in der Antwort** (RFC 9207), damit der Client prüfen kann, dass sie
  von dem Server kommt, den er gefragt hat.

### Zwei Bereiche, mehr nicht

`wattwerk:read` und `wattwerk:write`. Lesen ist immer dabei – ein Schreibrecht
ohne Leserecht wäre sinnlos. Feiner abzustufen hieße, eine Zustimmungsseite zu
bauen, die niemand liest, und am Ende stellt jeder alles an.

Die Abstufung wirkt an derselben Stelle wie bei den Zugangsschlüsseln: `read`
darf nur GET. Und eine verbundene Anwendung darf nie Schlüssel oder
Verbindungen verwalten oder das Konto löschen – sonst tränne sie die Konkurrenz
oder sich selbst wieder hinein.

### Was der Nutzer sieht

Eine Seite mit dem Namen der Anwendung, den Rechten im Klartext, Feldern für
E-Mail und Passwort und zwei Knöpfen. Danach steht die Verbindung im Portal
unter *Profil → Verbundene Anwendungen* und lässt sich dort trennen; das wirkt
sofort.

### Das geteilte Geheimnis

Der MCP-Server prüft Zugangstokens **selbst**, mit demselben
`ACCESS_TOKEN_SECRET` wie die API. Der Preis ist ein Geheimnis, das zwei
Dienste kennen. Der Gewinn ist, dass ein ungültiges Token sofort mit 401
beantwortet wird – und genau das braucht ein MCP-Client, um von sich aus eine
Anmeldung zu starten. Würde erst der spätere Werkzeugaufruf scheitern, bliebe
die Verbindung scheinbar in Ordnung, und niemand fände den Weg zur Anmeldung.

Ohne `ACCESS_TOKEN_SECRET` ist OAuth am MCP-Server abgeschaltet;
Zugangsschlüssel funktionieren weiter.

### Was noch fehlt

`ACCESS_TOKEN_SECRET` zu wechseln macht **alle** Zugangstokens ungültig, auch
die der Apps. Für einen einzelnen Nutzer ist das Trennen im Portal der Weg;
einen Notausschalter für alle gibt es nicht.

Ob ChatGPT die zwanzig Werkzeuge so anzeigt, wie Claude es tut, ist ungeprüft:
dessen Connector-Oberfläche erwartet für die Suche eigene `search`- und
`fetch`-Werkzeuge. Der Anmeldeweg steht, die Darstellung dort nicht.

## Zum Weitergeben: Bundle und Plugin

Der Weg über `.mcp.json` und gebaute Dateien ist ein Entwickler-Weg. Für
jemanden, der Wattwerk nur benutzen will, gibt es zwei fertige Pakete.

### Claude Desktop: das MCP-Bundle

```bash
yarn workspace @wattwerk/mcp build:bundle
```

Das erzeugt `packages/mcp/dist/wattwerk.mcpb` – ein Zip aus `manifest.json`,
Symbol und dem Server. Der Nutzer **öffnet die Datei per Doppelklick**, Claude
Desktop zeigt einen Installationsdialog mit zwei Feldern: Zugangsschlüssel
(maskiert, sicher abgelegt) und Adresse der API. Kein Terminal, kein curl,
keine Umgebungsvariablen.

Node braucht er auch nicht: Claude für macOS und Windows bringt eine eigene
Node-Laufzeit für Bundles mit.

Anders als `yarn build` bindet der Bundle-Bau **alles** ein, auch das MCP-SDK
und zod – im Bundle gibt es kein `node_modules`, an dem sich der Server
bedienen könnte. Das Ergebnis sind rund 300 kB gepackt.

Die Version in `bundle/manifest.json` muss der in `package.json` entsprechen;
der Bau bricht sonst ab. Zwei Versionsnummern, die auseinanderlaufen, sind auf
Dauer schlimmer als eine, die weh tut, wenn man sie vergisst.

### Claude Code: das Plugin

```bash
claude plugin marketplace add EliasPeeters/bikeTrainer
claude plugin install wattwerk@wattwerk
export WATTWERK_API_KEY=wk_...
```

Das Plugin (`plugins/wattwerk`) verbindet sich über HTTPS mit dem
MCP-Dienst – es baut nichts, klont nichts und braucht kein Node. Dazu bringt es
eine Fertigkeit mit, die durch das Anlegen des Schlüssels führt, wenn ein
Aufruf an fehlender Anmeldung scheitert.

Die Adresse steht dort **fest**: in der `.mcp.json` eines Plugins löst Claude
Code Variablen zwar in `headers` auf, aber nicht im `url`-Feld – geprüft mit
Claude Code 2.0.76. Wer einen eigenen Stack betreibt, trägt den Server direkt
ein statt über das Plugin.

Eine Sache ist dabei zu wissen: `initialize` und `tools/list` fassen die
Wattwerk-API nicht an. Ein falscher Schlüssel fällt deshalb erst beim ersten
Werkzeugaufruf auf – `/mcp` zeigt bis dahin `connected`.

## Aufbau

```
packages/mcp
├── bundle/             manifest.json und Symbol für das .mcpb-Bundle
├── scripts/            Bau des Bundles
└── src
    ├── index.ts        Verdrahtung: Werkzeuge an einem MCP-Server anmelden
    ├── stdio.ts        Einstieg für den stdio-Betrieb
    ├── http.ts         Der HTTP-Dienst: Torwache, Token je Aufruf, CORS
    ├── serve.ts        Einstieg für den HTTP-Betrieb
    ├── oauth.ts        Dieser Dienst als OAuth-Resource-Server
    ├── config.ts       Der eine Ort, an dem die Umgebung gelesen wird
    ├── api.ts          Die API als Methoden, samt Anmeldung und Wiederholung
    ├── schemas.ts      Eingaben der Werkzeuge (zod) und Umwandlung ins Drahtformat
    ├── format.ts       Antworten als lesbarer Text
    ├── result.ts       Werkzeugergebnisse und Fehlerbehandlung
    └── tools/          Je eine Datei pro Themenbereich
```

Einstieg und Bibliothek sind getrennt, und zwar zweimal aus demselben Grund:
esbuild bündelt `index.ts` in **beide** Ausgaben, und in einem Bündel ist
`require.main === module` immer wahr. Stünde der stdio-Start am Ende von
`index.ts`, ginge er im HTTP-Dienst mit los und schriebe ungefragt auf dessen
stdout. Und ein `http.ts`, das beim Import einen Sockel öffnet, ließe sich
nicht testen. Deshalb: `stdio.ts` und `serve.ts` starten etwas, alles andere
tut es nicht.

Auf stdout läuft im stdio-Betrieb das Protokoll – jede Ausgabe dorthin zerlegt
die Verbindung. Hinweise gehen deshalb nach stderr, wo der Client sie ins Log
schreibt. Im HTTP-Betrieb ist stdout das Containerlog und darf benutzt werden.

## Tests

```bash
yarn mcp:test
```

40 Unit-Tests gegen ein `fetch`-Doppel: Anmeldung und Wiederholung nach einem
401, Fehlerzuordnung, Kodierung der Kennungen in der Adresse, die Aufbereitung
der Antworten, die Eingabeprüfung – und für den HTTP-Dienst die Torwache: kein
Token, kaputter Header, falsche Methode, falscher Pfad, keine CORS-Freigabe für
fremde Herkünfte, und dass das Token des Aufrufs durchgereicht statt
gespeichert wird. Eine Datenbank brauchen sie nicht.

Der Weg gegen eine echte API ist von Hand geprüft: alle zwanzig Werkzeuge
einmal gegen den laufenden lokalen Stack, einschließlich der Fehlerwege – über
stdio, über HTTP und aus dem fertigen Container heraus.
