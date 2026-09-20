# Bluetooth

## Was die App spricht

Ausschließlich standardisierte Bluetooth-SIG-Profile, keine Herstellerprotokolle.

| Service | UUID | Wofür |
|---|---|---|
| Fitness Machine | `0x1826` | Leistung, Trittfrequenz, Tempo **und ERG-Steuerung** |
| Cycling Power | `0x1818` | Rückfall: nur Messwerte |
| Cycling Speed & Cadence | `0x1816` | Erkennung beim Suchen |
| Heart Rate | `0x180D` | Pulsgurt |
| Battery | `0x180F` | Ladestand in der Geräteliste |

### Fitness Machine im Einzelnen

* **Indoor Bike Data (`0x2AD2`, Notify)** – ein Flags-Wort, dann die Felder, die
  der Trainer mitschickt. Stolperstelle: Bit 0 heißt *More Data* und ist
  invertiert – ist es **frei**, steckt die Momentangeschwindigkeit im Paket.
  Genau das prüft ein eigener Test.
* **Feature (`0x2ACC`, Read)** – zwei 32-Bit-Wörter. Bit 3 des zweiten Wortes
  entscheidet, ob ERG überhaupt geht.
* **Control Point (`0x2AD9`, Write + Indicate)** – `0x00` Steuerung anfordern,
  `0x07` starten, `0x05` Zielleistung setzen, `0x01` zurücksetzen. Jede Antwort
  kommt als `0x80 <Befehl> <Ergebnis>`; die App wartet mit einer Zeitgrenze von
  drei Sekunden darauf.
* **Supported Power Range (`0x2AD8`, Read)** – begrenzt die Vorgaben auf das,
  was der Trainer kann.

Ablauf beim Verbinden: Steuerung anfordern → starten → Ziele senden. Manche
Trainer kennen `0x07` nicht; das wird bewusst ignoriert statt als Fehler
behandelt.

## Der D500

Die Umsetzung ist nach Spezifikation gebaut, aber an deinem Trainer noch nicht
erprobt. So findest du heraus, woran du bist:

1. **Geräte** öffnen, **Suchen** drücken. Tritt dabei kurz in die Pedale – viele
   Trainer senden nur, wenn sie wach sind.
2. Taucht der Trainer mit dem Abzeichen **FTMS** auf, stehen die Chancen gut.
3. Verbinden. Unter *Verbunden* steht dann entweder **ERG-Steuerung** oder
   **Nur Messung**.
4. Eine Einheit starten. Bei ERG ändert sich der Widerstand beim Blockwechsel
   spürbar, unabhängig davon, wie schnell du trittst.

**Kein FTMS, aber Cycling Power?** Dann funktioniert die App als Anzeige: Ziel
und Ablauf stehen auf dem Bildschirm, den Widerstand stellst du selbst ein. Der
Fahrtbildschirm sagt das offen („Zielvorgabe nur zur Anzeige“).

**Gar nichts gefunden?** Einige ältere Heimtrainer, unter anderem manche
Domyos-Modelle, sprechen ein eigenes Protokoll. Dann braucht es einen eigenen
Treiber. Der ist vorbereitet: `TrainerControl` implementieren, in
`BluetoothManager` einhängen – der Rest der App merkt nichts davon. Für die
Analyse hilft ein BLE-Scanner (nRF Connect, LightBlue): Services auslesen und
schauen, was der Trainer tatsächlich anbietet.

## Berechtigungen

* Beide Apps setzen `NSBluetoothAlwaysUsageDescription` über die generierte
  Info.plist.
* Die Mac-App läuft in der Sandbox mit `com.apple.security.device.bluetooth`
  und Schreibrecht auf vom Nutzer gewählte Dateien (für den CSV-Export).
* tvOS unterstützt CoreBluetooth als Zentrale. Die Zahl gleichzeitiger
  Verbindungen ist begrenzt – zwei (Trainer plus Pulsgurt) sind kein Problem.

## Robustheit

* **Wiederverbinden** – zuletzt benutzte Geräte werden beim Start automatisch
  gesucht; bricht eine Verbindung mit Fehler ab, versucht die App es erneut.
* **Stehende Sensoren** – kommen fünf Sekunden keine Werte, zeigt die App Null
  statt die letzte Zahl einzufrieren. Beim Ausrollen ist das der ehrlichere Wert.
* **Kaputte Pakete** – jeder Lesezugriff ist längengeprüft. Ein zu kurzes Paket
  liefert fehlende Felder, es stürzt nichts ab.
* **Zählerüberläufe** – Kurbelumdrehungen laufen bei 65536 über, der Zeitstempel
  alle 64 Sekunden. Beide Differenzen werden modulo gerechnet.
