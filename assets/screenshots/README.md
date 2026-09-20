# Screenshots

Die nackten Aufnahmen der App. Beide Sätze stammen aus **Release**-Bauten – im
Debug-Bau zeigt *Konto* ein Feld für die Serveradresse, das in der
ausgelieferten App nicht existiert.

Was daraus wird:

* [`../store/`](../store/) – dieselben Aufnahmen mit Überschrift und
  Hintergrund, in den Maßen von App Store Connect.
* `packages/landingpage/public/shots/` – auf 1760 px verkleinerte WebP-Fassungen
  für die Landingpage.

## macOS

`macos/` – 2880 × 1800 px, ein 1440 × 900 Punkte großes Fenster auf einem
Retina-Bildschirm, aufgenommen mit `screencapture -l` (Fenster samt Titelleiste,
ohne Schlagschatten). App Store Connect nimmt für macOS 1280 × 800, 1440 × 900,
2560 × 1600 und 2880 × 1800.

| Datei | Zeigt |
|---|---|
| `01-bibliothek.png` | Training: Katalog in Reihen, Seitenleiste mit Sensorstatus |
| `02-programm.png` | Ein Programm im Detail: Profil, Kennzahlen, Ablauf |
| `03-editor.png` | Der Programm-Editor – gibt es nur auf dem Mac |
| `04-fahrt.png` | Die Fahrt: Leistung gegen Ziel, Restzeit, Puls, Ø/NP/kJ |
| `05-auswertung.png` | Nach der Einheit: Kennzahlen und Zeit in den Zonen |
| `06-verlauf.png` | Verlauf: Wochenbelastung und die letzten Einheiten |
| `07-geraete.png` | Geräte: Suche, Verbundenes, Simulator |
| `08-profil.png` | Profil: Fahrerdaten, FTP, App-Einstellungen |
| `09-konto.png` | Konto: „Ohne Konto geht alles, mit Konto überall" |

## tvOS

`tvos/` – 3840 × 2160 px, Simulator „Apple TV 4K (3rd generation)" unter
tvOS 27. App Store Connect nimmt für Apple TV 1920 × 1080 und 3840 × 2160.

| Datei | Zeigt |
|---|---|
| `01-bibliothek.png` | Training: Katalog in Reihen, mit Dauer und TSS je Programm |
| `02-programm.png` | Ein Programm im Detail, Ablauf rechts daneben |
| `03-fahrt.png` | Die Fahrt, aus drei Metern lesbar |
| `04-auswertung.png` | Nach der Einheit: Kennzahlen und Zeit in den Zonen |
| `05-verlauf.png` | Verlauf: Wochenbelastung und die letzten Einheiten |
| `06-profil.png` | Profil: Fahrerdaten, FTP, App-Einstellungen |
| `07-konto.png` | Konto: „Ohne Konto geht alles, mit Konto überall" |

Die Nummerierung ist die vorgeschlagene Reihenfolge im Eintrag.

## Wie die Bilder entstehen

Die App fährt sich für die Aufnahme selbst in den gewünschten Zustand: der
Apple TV lässt sich ohne Simulator-Fenster nicht fernbedienen – `simctl` kann
Tasten wie HOME senden, aber keine Richtungen, und Touch lehnt tvOS ab –, und
ein Verlauf mit einer einzigen Einheit sieht nach nichts aus. Dafür liegt in
[`Scripts/screenshots/`](../../Scripts/screenshots/) ein Treiber, der über die
Umgebungsvariable `WATTWERK_SHOT` angesteuert wird und ohne sie vollständig
inaktiv ist. Er gehört **nicht** in einen Release-Build, der in den Store geht.

```bash
cp Scripts/screenshots/ScreenshotDriver.swift Sources/WattwerkUI/
git apply Scripts/screenshots/hooks.patch

Scripts/screenshots/shoot-tv.sh      # 3840 × 2160, in .build/screenshots/tv
Scripts/screenshots/shoot-mac.sh     # 2880 × 1800, in .build/screenshots/mac

git checkout -- Sources/WattwerkUI/Screens
rm Sources/WattwerkUI/ScreenshotDriver.swift
```

Die Aufnahmen aus `.build/screenshots/` von Hand nach `assets/screenshots/`
übernehmen – dann die beiden abgeleiteten Sätze:

```bash
node Scripts/screenshots/store-graphics.mjs   # → assets/store/
Scripts/screenshots/web-images.sh             # → packages/landingpage/public/shots/
```

`web-images.sh` braucht `cwebp` (`brew install webp`); `sips` kann WebP nicht
schreiben.

`shoot-mac.sh` braucht für das aufrufende Programm ein Häkchen in
*Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- &
Systemaudioaufnahme*; sonst antwortet `screencapture` mit *could not create
image from display*. Der Mac-Lauf baut mit der Bundle-ID
`de.eliaspeeters.wattwerk.shots`, damit der erfundene Verlauf nicht im Ablageort
der richtigen App landet.

Die Einheiten im Verlauf sind keine ausgedachten Zahlen: `WATTWERK_SHOT=seed`
lässt die echte Ride-Engine neun Einheiten der letzten drei Wochen im Zeitraffer
durchfahren – je simulierter Sekunde ein Messwert und ein Tick. Dauer,
Durchschnitt, NP, TSS und kJ stammen damit aus derselben Rechnung wie bei einer
gefahrenen Einheit. Dasselbe gilt für die Fahrt-Aufnahme: 13:06 bei Ø 130 W
ergibt die angezeigten 102 kJ.

## Was bewusst fehlt

* **Geräte auf dem Apple TV.** Der Simulator meldet dort „Dieses Gerät
  unterstützt kein Bluetooth Low Energy" – ein echter Apple TV kann das. Die
  Aufnahme würde einen Mangel zeigen, den es nicht gibt. Sie liegt nach einem
  Lauf unter `.build/screenshots/tv/devices.png`.
