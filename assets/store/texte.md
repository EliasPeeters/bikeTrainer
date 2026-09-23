# Store-Texte

Alles, was in App Store Connect an Text eingetragen wird. Beide Plattformen
liegen unter **einem** Eintrag (`de.eliaspeeters.wattwerk`), Untertitel,
Beschreibung und Screenshots sind aber **je Plattform** eigene Felder — die
macOS- und die tvOS-Fassung unterscheiden sich, weil sich die Apps
unterscheiden.

Die Zeichengrenzen stehen dahinter; die Zahlen sind nachgezählt, nicht
geschätzt. Prüfen lässt sich das mit
`node Scripts/check-store-text.mjs`.

---

## Gemeinsam für beide Plattformen

**Name** (max. 30)

```
Wattwerk
```

**Schlüsselwörter** (max. 100, mit Komma getrennt, keine Leerzeichen dahinter)

```
Indoor,Radtraining,Smarttrainer,FTMS,Intervall,FTP,Watt,Rollentrainer,Radsport,Trittfrequenz
```

Kein Name eines fremden Produkts. Apple weist Einträge zurück, die
Mitbewerber als Schlüsselwort führen (Richtlinie 5.2.1), und Begriffe aus Name
und Untertitel werden ohnehin getrennt indiziert — sie hier zu wiederholen
verschenkt nur Platz.

**Adressen**

| Feld | Wert |
|---|---|
| Support-URL | `https://wattwerk.eliaspeeters.de` |
| Marketing-URL | `https://wattwerk.eliaspeeters.de` |
| Datenschutz-URL | `https://wattwerk.eliaspeeters.de/datenschutz` |

**Kategorie** Gesundheit und Fitness, zweitrangig Sport.
**Altersfreigabe** 4+.

---

## macOS

**Untertitel** (max. 30)

```
Strukturiert am Trainer fahren
```

**Werbetext** (max. 170, lässt sich ohne neue Prüfung ändern)

```
Programme am Mac bauen, im Wohnzimmer am Apple TV fahren, im Web-Portal auswerten. Mit Konto überall derselbe Stand – ohne Konto bleibt alles auf dem Gerät.
```

**Beschreibung** (max. 4000)

```
Strukturiertes Indoor-Radtraining: Programm auswählen, den Smarttrainer per Bluetooth steuern lassen, jede Einheit aufzeichnen. Kein Abo, keine Avatare, kein Punktestand – nur die Zahlen, auf die es beim Training ankommt.

PROGRAMME, DIE SCHON DA SIND

Elf Einheiten sind eingebaut: Grundlage 60, Sweet Spot 3x12, Over-Unders 3x9, VO2max 5x3, 30/30er, Pyramide, Tabata, Kadenzspiel, Aktive Erholung 30, ein Rampentest zur FTP-Bestimmung und die Freie Fahrt ohne Vorgabe. Jede Karte zeigt Profil, Dauer und Belastung, bevor du sie öffnest.

DER TRAINER MACHT MIT

Wattwerk spricht FTMS, das offene Bluetooth-Profil für Fitnessgeräte, und gibt deinem Smarttrainer die Zielleistung vor. Du trittst, der Widerstand folgt dem Programm. Bei der Gerätesuche zeigt ein Abzeichen, ob ein gefundener Trainer FTMS beherrscht. Reine Leistungsmesser und Pulsgurte lassen sich ebenso verbinden; ein eigener Gurt sticht dabei den Wert, den der Trainer durchreicht.

WÄHREND DER FAHRT

Die große Zahl ist deine Leistung, daneben steht das Ziel. Sie färbt sich grün, solange du im Fenster liegst. Dazu Restzeit im Block, Trittfrequenz mit Zielbereich, Puls, Durchschnitt, normalisierte Leistung und geleistete Arbeit. Zu hart? Ein Knopf macht die ganze Einheit stufenweise leichter, ohne das Programm zu verlassen. Block vor, Block zurück und Pause gibt es auch. Der Bildschirm schläft währenddessen nicht ein.

NACH DER FAHRT

Dauer, Durchschnitt, normalisierte Leistung, Belastung in TSS, Arbeit in Kilojoule und Durchschnittspuls – dazu, wie lange du in welcher der sieben Leistungszonen unterwegs warst. Ob die Einheit gespeichert wird, entscheidest du. Im Verlauf steht danach jede Fahrt mit ihren Kennzahlen, die Wochenbelastung addiert sich von selbst, und jede Einheit lässt sich als CSV Sekunde für Sekunde ausgeben.

EINE ZAHL REGIERT ALLES

Sämtliche Vorgaben rechnen in Prozent deiner FTP. Ändert sich die FTP, ändern sich alle Programme mit – ohne dass du eine einzige Zahl nachträgst. Den Rampentest rechnet die App auf Wunsch gleich in eine neue FTP um.

EIGENE PROGRAMME

Der Editor baut Einheiten aus Blöcken: konstant oder Rampe, Dauer frei wählbar, Zielwert in Prozent FTP oder direkt in Watt, dazu ein Trittfrequenzbereich. Blöcke lassen sich verschieben, verdoppeln und löschen; Profil, Belastung und Intensität rechnen beim Bauen mit.

MIT KONTO ODER OHNE

Ohne Anmeldung funktioniert die App vollständig – hinter dem Konto ist keine Funktion versteckt. Wer eines anlegt, bekommt den Abgleich: Programme, Ordner und gefahrene Einheiten liegen dann auf allen Geräten gleich, das Web-Portal zeigt denselben Stand, und eigene Programme lassen sich mit anderen teilen.

VORAUSSETZUNGEN

macOS 14 oder neuer. Für die Steuerung ein Smarttrainer mit Bluetooth Low Energy, der FTMS beherrscht. Ausprobieren geht auch ohne Rad: unter "Geräte" den Simulator einschalten, dann läuft eine Einheit mit glaubhaften Leistungs-, Trittfrequenz- und Pulswerten durch.
```

---

## tvOS

**Untertitel** (max. 30)

```
Indoor-Training am Fernseher
```

**Werbetext** (max. 170)

```
Programme am Mac oder im Web-Portal bauen, am Apple TV fahren. Dieselbe Bibliothek, dieselben Einheiten – nur groß genug, um sie vom Rad aus zu lesen.
```

**Beschreibung** (max. 4000)

```
Strukturiertes Indoor-Radtraining im Wohnzimmer: Programm auswählen, den Smarttrainer per Bluetooth steuern lassen, jede Einheit aufzeichnen. Alles so groß gesetzt, dass es vom Rad aus lesbar bleibt.

PROGRAMME, DIE SCHON DA SIND

Elf Einheiten sind eingebaut: Grundlage 60, Sweet Spot 3x12, Over-Unders 3x9, VO2max 5x3, 30/30er, Pyramide, Tabata, Kadenzspiel, Aktive Erholung 30, ein Rampentest zur FTP-Bestimmung und die Freie Fahrt ohne Vorgabe. Die Bibliothek liegt in Reihen vor dir, jede Karte zeigt Profil, Dauer und Belastung – ausgewählt wird mit der Fernbedienung.

DER TRAINER MACHT MIT

Wattwerk spricht FTMS, das offene Bluetooth-Profil für Fitnessgeräte, und gibt deinem Smarttrainer die Zielleistung vor. Du trittst, der Widerstand folgt dem Programm. Der Trainer verbindet sich direkt mit dem Apple TV; ein Mac muss dafür nicht mitlaufen. Reine Leistungsmesser und Pulsgurte lassen sich ebenso verbinden.

WÄHREND DER FAHRT

Die große Zahl ist deine Leistung, daneben steht das Ziel. Sie färbt sich grün, solange du im Fenster liegst. Dazu Restzeit im Block, Trittfrequenz mit Zielbereich, Puls, Durchschnitt, normalisierte Leistung und geleistete Arbeit – aus drei Metern Entfernung lesbar. Die Play/Pause-Taste der Fernbedienung hält die Einheit an, der Bildschirm schläft während der Fahrt nicht ein.

NACH DER FAHRT

Dauer, Durchschnitt, normalisierte Leistung, Belastung in TSS, Arbeit in Kilojoule und Durchschnittspuls – dazu, wie lange du in welcher der sieben Leistungszonen unterwegs warst. Ob die Einheit gespeichert wird, entscheidest du. Im Verlauf steht danach jede Fahrt mit ihren Kennzahlen, und die Wochenbelastung addiert sich von selbst.

EINE ZAHL REGIERT ALLES

Sämtliche Vorgaben rechnen in Prozent deiner FTP. Ändert sich die FTP, ändern sich alle Programme mit – ohne dass du eine einzige Zahl nachträgst. Den Rampentest rechnet die App auf Wunsch gleich in eine neue FTP um.

AM MAC GEBAUT, HIER GEFAHREN

Eigene Programme entstehen in der Mac-App oder im Web-Portal, wo sich Blöcke bequem mit Tastatur und Maus setzen lassen. Mit Konto stehen sie unmittelbar danach auch auf dem Apple TV bereit, zusammen mit deinen Ordnern und dem Verlauf.

MIT KONTO ODER OHNE

Ohne Anmeldung funktioniert die App vollständig – hinter dem Konto ist keine Funktion versteckt. Es bringt den Abgleich zwischen den Geräten und das Web-Portal, mehr nicht.

VORAUSSETZUNGEN

tvOS 17 oder neuer. Für die Steuerung ein Smarttrainer mit Bluetooth Low Energy, der FTMS beherrscht. Ausprobieren geht auch ohne Rad: unter "Geräte" den Simulator einschalten, dann läuft eine Einheit mit glaubhaften Leistungs-, Trittfrequenz- und Pulswerten durch.
```

---

## Neu in dieser Version (1.0, beide Plattformen)

```
Die erste Fassung.
```

Ab 1.1 gehört hierhin, was sich geändert hat – nicht "Fehlerbehebungen und
Verbesserungen".

---

## Hinweise für die App-Prüfung

Gehört in App Store Connect unter *App-Prüfungsinformationen → Notizen*. Der
Prüfer hat keinen Smarttrainer; ohne diesen Hinweis kommt er nicht über den
ersten Bildschirm hinaus, und das endet in einer Ablehnung wegen
"Wir konnten die Funktion nicht bewerten".

```
Die App braucht kein Konto: jede Funktion ist ohne Anmeldung erreichbar. Ein Demo-Zugang ist deshalb nicht nötig.

Zum Prüfen ohne Smarttrainer ist ein Simulator eingebaut:

1. "Geräte" öffnen und den Schalter "Simulator" einschalten.
2. Auf "Training" wechseln und ein Programm auswählen, zum Beispiel "Sweet Spot 3x12".
3. "Einheit starten". Die App zeigt daraufhin Leistung, Trittfrequenz und Puls wie mit einem echten Trainer und steuert die Blöcke des Programms durch.
4. Über "Beenden" erscheint die Auswertung; nach dem Speichern steht die Einheit unter "Verlauf".

Beim ersten Öffnen von "Geräte" fragt das System nach der Bluetooth-Berechtigung. Sie wird für die Verbindung zu Smarttrainern und Pulsgurten nach dem FTMS-Profil verwendet; ohne Zustimmung bleibt der Simulator nutzbar.

Ein Konto lässt sich über "Konto" frei anlegen. Es dient allein dem Abgleich zwischen Mac, Apple TV und dem Web-Portal auf https://wattwerk.eliaspeeters.de.
```

---

## Was noch zu entscheiden ist

* **Preis.** In der Beschreibung steht "Kein Abo". Das ist eine Aussage über
  das Preismodell, das in App Store Connect gesetzt wird — sie muss dazu
  passen.
* **Sprache.** Der Eintrag ist einsprachig deutsch, weil die App selbst nur
  Deutsch spricht. Ein englischer Eintrag würde Leute anziehen, die dann vor
  einer deutschen Oberfläche stehen.
* **FTMS.** Die Texte sagen, dass die App FTMS spricht — nicht, dass sie mit
  jedem Trainer am Markt erprobt ist. Das ist Absicht: bislang ist die
  Umsetzung an keinem echten Gerät gefahren worden (siehe README, „Nicht
  geprüft").
