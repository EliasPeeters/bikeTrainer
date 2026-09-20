# Auf den VPS bringen

Eine GitHub-Action baut und startet den ganzen Stack: Datenbank, Migrationen,
API und Landingpage. Ausgelöst wird sie von Hand — wann etwas live geht, ist
eine Entscheidung und kein Nebeneffekt vom Committen.

Adressen am Ende:

| Adresse | Was |
|---|---|
| `https://wattwerk.eliaspeeters.de` | Landingpage und Web-Portal |
| `https://api.wattwerk.eliaspeeters.de` | API, für die Mac- und Apple-TV-App |

Das Web-Portal ruft die API **nicht** über die zweite Adresse auf. Es fragt
`/api` auf seiner eigenen Adresse, und der nginx im Landingpage-Container
reicht das intern an das Backend weiter. Dadurch gibt es für das Portal kein
CORS und keine Adresse im gebauten JavaScript. Die zweite Adresse ist für die
Apps da.

---

## 1. Einmalig auf dem Server

Der Nginx Proxy Manager läuft selbst in einem Container. Damit er die
Wattwerk-Container über ihren Namen erreicht, müssen beide im selben
Docker-Netz hängen:

```bash
docker network create wattwerk-proxy
```

Dann den Proxy Manager anschließen. Schnell und für den Moment:

```bash
docker network connect wattwerk-proxy <name-des-proxy-manager-containers>
```

Dauerhaft besser — in die Compose-Datei des Proxy Managers eintragen, sonst ist
die Verbindung nach dem nächsten Neubau seines Containers wieder weg:

```yaml
services:
  app:                       # so heißt der Dienst im offiziellen Beispiel
    networks:
      - default
      - wattwerk-proxy

networks:
  wattwerk-proxy:
    external: true
```

Prüfen, ob es sitzt:

```bash
docker network inspect wattwerk-proxy --format '{{range .Containers}}{{.Name}} {{end}}'
```

Danach muss der Container des Proxy Managers in der Ausgabe stehen.

## 2. Schlüssel für die Auslieferung

Auf deinem Rechner:

```bash
ssh-keygen -t ed25519 -C "wattwerk-deploy" -f ~/.ssh/wattwerk_deploy -N ""
ssh-copy-id -i ~/.ssh/wattwerk_deploy.pub <benutzer>@<vps>
```

Der **private** Schlüssel (`~/.ssh/wattwerk_deploy`, vollständig mit den
`BEGIN`/`END`-Zeilen) kommt gleich als Secret in GitHub.

Geheimnisse für die API erzeugen — drei verschiedene, jeweils frisch:

```bash
openssl rand -base64 48
```

## 3. Secrets und Variablen in GitHub

*Settings → Secrets and variables → Actions*

**Secrets** (verschlüsselt, in Logs unkenntlich gemacht):

| Name | Inhalt |
|---|---|
| `VPS_HOST` | IP oder Hostname des Servers |
| `VPS_USER` | SSH-Benutzer |
| `VPS_SSH_KEY` | der private Schlüssel von oben |
| `DB_ROOT_PASSWORD` | frisch erzeugt |
| `DB_PASSWORD` | frisch erzeugt, anderes als das Root-Passwort |
| `ACCESS_TOKEN_SECRET` | frisch erzeugt |
| `REFRESH_TOKEN_SECRET` | frisch erzeugt, anderes als das Zugangstoken-Geheimnis |
| `VPS_KNOWN_HOSTS` | *optional*, siehe unten |

Die beiden Token-Geheimnisse müssen sich unterscheiden. Sonst ließe sich ein
Auffrischungstoken — das 90 Tage gilt — direkt als Zugangstoken verwenden, und
dessen kurze Laufzeit wäre wirkungslos.

**Variables** (nicht geheim, alle haben einen Standardwert):

| Name | Standard |
|---|---|
| `VPS_PATH` | `~/wattwerk` |
| `VPS_PORT` | `22` |
| `BASE_URL` | `https://api.wattwerk.eliaspeeters.de` |
| `CORS_ORIGINS` | `https://wattwerk.eliaspeeters.de` |
| `PROXY_NETWORK` | `wattwerk-proxy` |
| `API_PORT` | `8088` |
| `LANDINGPAGE_PORT` | `8089` |

`API_PORT` und `LANDINGPAGE_PORT` binden **nur auf 127.0.0.1** — von außen ist
darüber nichts erreichbar. Sie sind zum Nachsehen auf dem Server da
(`curl http://127.0.0.1:8088/health`). Die Datenbank bekommt gar keinen Port.

### Den Serverschlüssel anheften (empfohlen)

Ohne `VPS_KNOWN_HOSTS` übernimmt die Pipeline den Schlüssel des Servers beim
ersten Kontakt. Das funktioniert, verlässt sich aber darauf, dass dabei niemand
dazwischensitzt. Fester ist:

```bash
ssh-keyscan -H <vps> 2>/dev/null
```

Die Ausgabe als Secret `VPS_KNOWN_HOSTS` hinterlegen.

## 4. Die beiden Proxy Hosts anlegen

Im Nginx Proxy Manager unter *Hosts → Proxy Hosts → Add Proxy Host*.

**Landingpage**

| Feld | Wert |
|---|---|
| Domain Names | `wattwerk.eliaspeeters.de` |
| Scheme | `http` |
| Forward Hostname / IP | `wattwerk-landingpage` |
| Forward Port | `80` |
| Block Common Exploits | an |
| Cache Assets | an |

**API**

| Feld | Wert |
|---|---|
| Domain Names | `api.wattwerk.eliaspeeters.de` |
| Scheme | `http` |
| Forward Hostname / IP | `wattwerk-backend` |
| Forward Port | `8080` |
| Block Common Exploits | an |
| Cache Assets | **aus** |

Der Port ist der **innere** Port des Containers (8080), nicht der auf dem Host.
Der Proxy Manager spricht die Container direkt über das gemeinsame Netz an.

Im Reiter *SSL* bei beiden: *Request a new SSL Certificate*, dazu *Force SSL*
und *HTTP/2 Support*. Die DNS-Einträge für beide Namen müssen vorher auf den
VPS zeigen, sonst schlägt die Ausstellung fehl.

## 5. Ausliefern

*Actions → „Auf den VPS ausliefern" → Run workflow.*

Der Job macht der Reihe nach:

1. Typprüfung und Unit-Tests (abschaltbar über den Schalter am Start)
2. Dateien per `rsync` nach `~/wattwerk` — ohne `node_modules`, ohne die
   Swift-Seite, ohne die Quellgrafiken
3. `.env` aus den Secrets schreiben, mit Rechten `600`
4. Proxy-Netz anlegen, falls es fehlt
5. `docker compose -f docker-compose.prod.yml up -d --build`
6. Warten, bis `/health` antwortet, und die Landingpage prüfen

Der erste Durchlauf dauert einige Minuten, weil der Server beide Abbilder baut.
Danach greifen die Docker-Schichten und es geht deutlich schneller.

## Nachsehen, wenn etwas klemmt

```bash
cd ~/wattwerk
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
curl http://127.0.0.1:8088/health
```

| Symptom | Ursache |
|---|---|
| `network wattwerk-proxy declared as external, but could not be found` | Netz fehlt — `docker network create wattwerk-proxy` |
| Proxy Manager meldet `Bad Gateway` | Sein Container hängt nicht im Netz `wattwerk-proxy` |
| Backend startet nicht, Log nennt eine Variable | Ein Secret fehlt in GitHub — `assertProductionConfig` verweigert den Start mit Entwicklungswerten |
| Flyway bricht ab | Prüfsumme einer bereits eingespielten Migration hat sich geändert. Migrationen werden nie nachträglich bearbeitet, es kommt eine neue Datei dazu |
| Registrierung antwortet mit 429 | Die Ratenbegrenzung greift: fünf Registrierungen je IP und Stunde. Über die Variable `REGISTER_RATE_LIMIT` änderbar |

## Sicherungen

Es gibt noch keine automatische Sicherung — das ist der erste Punkt, sobald
echte Konten darin liegen. Von Hand:

```bash
docker exec wattwerk-db mariadb-dump -u root -p"$DB_ROOT_PASSWORD" --single-transaction wattwerk \
  | gzip > ~/wattwerk-$(date +%F).sql.gz
```

Zurückspielen:

```bash
gunzip < ~/wattwerk-2026-09-20.sql.gz \
  | docker exec -i wattwerk-db mariadb -u root -p"$DB_ROOT_PASSWORD" wattwerk
```

## Die Apps

Auslieferbauten zeigen auf `https://api.wattwerk.eliaspeeters.de`; das steht in
`APIEnvironment.defaultBaseURL`. Debug-Bauten benutzen weiterhin
`http://localhost:8088` und lassen die Adresse unter *Konto* umstellen.

Für den Apple TV im selben Netz wie der Entwicklungsrechner reicht dort die IP
des Macs. Sobald die Domain steht, braucht es nichts davon mehr.
