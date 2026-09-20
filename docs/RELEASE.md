# In den App Store

Beide Apps liegen unter **einem** Eintrag in App Store Connect
(`de.eliaspeeters.wattwerk`, Plattformen macOS und tvOS). Hochgeladen wird mit:

```bash
Scripts/release-apps.sh          # beide
Scripts/release-apps.sh mac      # nur macOS
Scripts/release-apps.sh tv       # nur tvOS
```

## Das richtige Team

Auf diesem Rechner gibt es zwei:

| Team-ID | Name | Bedeutung |
|---|---|---|
| **`4R6MBU349U`** | Elias Peeters | Die aktive Mitgliedschaft. Ihr gehören der App-Eintrag und der API-Schlüssel |
| `UGH9WJUCZN` | Elias Peeters | Eine ältere Mitgliedschaft. Deren Distributionszertifikat lief 2024 ab |

Beide heißen gleich, was leicht in die Irre führt. `DEVELOPMENT_TEAM` im Projekt
muss auf **4R6MBU349U** stehen. Steht dort das andere, meldet Xcode
`No Account for Team "UGH9WJUCZN"` — eine Meldung, die nach einem fehlenden
Konto klingt, obwohl das Konto da ist und nur die Mitgliedschaft fehlt.

Die Team-ID eines Zertifikats steht im OU-Feld, nicht in der Klammer hinter dem
Namen:

```bash
security find-certificate -c "Apple Distribution: Elias Peeters" -p | openssl x509 -noout -subject
```

Was das Team wirklich hat, sagt die API — unabhängig von allem, was Xcode
zwischengespeichert hat:

```bash
node Scripts/asc-info.js
```

## Voraussetzungen

1. **API-Schlüssel** unter `~/.appstoreconnect/private_keys/AuthKey_PWF9SDKK9M.p8`,
   Rechte 600.
2. **Zertifikate** im Schlüsselbund: „Apple Distribution" und
   „Mac Installer Distribution" des Teams 4R6MBU349U. Anlegen in Xcode unter
   *Settings → Apple Accounts → Team wählen → Manage Certificates → +*.
3. **tvOS-Store-Profil**, einmalig:

   ```bash
   node Scripts/make-profile.js TVOS_APP_STORE "Wattwerk tvOS App Store"
   ```

## Zwei Fallstricke, die im Skript schon gelöst sind

**tvOS wird von Hand signiert.** Bei automatischer Signatur fordert Xcode beim
Archivieren ein *Entwicklungs*profil an und scheitert mit „Your team has no
devices from which to generate a provisioning profile". Für den Store braucht es
kein Gerät — deshalb Store-Profil und Distributionszertifikat direkt vorgeben.

**Der Export läuft mit aufgeräumtem PATH.** Xcodes Verpackungsschritt ruft
`/usr/bin/rsync` auf. Das ist unter aktuellem macOS *openrsync*, und es reicht
`-E` als `--extended-attributes` an die Gegenstelle weiter. Liegt eine neuere
rsync im PATH — etwa aus Homebrew unter `/opt/homebrew/bin` — wird die als
Gegenstelle benutzt, kennt die Option nicht, und der Export bricht mit dem
nichtssagenden `Copy failed` ab. Das Skript setzt den PATH für diesen einen
Aufruf auf die Systemverzeichnisse.

## Versionen

`MARKETING_VERSION` und `CURRENT_PROJECT_VERSION` stehen im Projekt. Jeder
Upload braucht eine **neue Build-Nummer** je Plattform; dieselbe zweimal lehnt
App Store Connect ab. Vor dem nächsten Upload also
`CURRENT_PROJECT_VERSION` erhöhen.

## Was vor dem Einreichen noch fehlt

* In der Datenschutzerklärung unter `/datenschutz`: Anschrift, Kontakt und
  Hoster eintragen.
* Impressum nach DDG.
* Im Fragebogen von App Store Connect dieselben Datenarten angeben wie in
  `PrivacyInfo.xcprivacy`: E-Mail, Name, Fitness, Gesundheit — jeweils dem Konto
  zugeordnet, kein Tracking.
* Screenshots und Beschreibung je Plattform.
