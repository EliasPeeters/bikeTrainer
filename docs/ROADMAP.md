# Wohin als Nächstes

Grob nach Nutzen sortiert. Nichts davon ist begonnen.

## Zuerst: am echten Trainer prüfen

Der wichtigste Punkt. Mit dem D500 verbinden, eine Einheit fahren und
beobachten, ob ERG greift, wie schnell der Trainer auf Zielwechsel reagiert und
ob die Werte plausibel sind. Alles Weitere hängt davon ab.

## Bald

* **App-Icons** für beide Plattformen (Kataloge liegen leer bereit).
* **FIT- oder TCX-Export**, damit Einheiten in Strava, Garmin Connect oder
  intervals.icu landen. CSV gibt es schon, reicht aber nur für Tabellen.
* **Datei-Import von Programmen** – `.zwo` aus der Zwift-Welt zu lesen wäre die
  billigste Art, an hunderte fertige Einheiten zu kommen.
* **Einlaufassistent** – der Rampentest rechnet die FTP bereits aus dem besten
  Minutenschnitt aus; das gehört an den Schluss der Einheit statt ins Profil.
* **iOS-/iPadOS-Target.** Ein Target, `WattwerkUI` verlinken, fertig. Das iPad
  wäre auch der bequemere Ort für den Editor.

## Backend und Landingpage

* **Die App an die API hängen.** Beide Seiten stehen, dazwischen fehlt der
  Client: anmelden, Fahrerprofil abgleichen, gefahrene Einheiten hochladen.
  `packages/shared` hat die Typen dafür schon.
* **Mailversand.** Ohne ihn bleibt die Bestätigung ein Log-Eintrag.
* **Programme synchronisieren.** Heute liegt die Bibliothek nur auf dem Gerät;
  am Mac gebaute Programme tauchen auf dem Apple TV nicht auf.
* **Passwort vergessen.** Fehlt komplett.
* **Ratenbegrenzung in einen gemeinsamen Speicher**, sobald mehr als eine
  Instanz läuft – heute zählt jeder Prozess für sich.

## Später

* **Streckenmodus** statt ERG: Der Control-Point-Befehl für Simulationsparameter
  (`0x11`) ist implementiert, aber ungenutzt. Damit ließe sich eine Steigung
  fahren statt einer festen Wattzahl.
* **Trainingsplan über Wochen** mit Belastungsverlauf – die Wochensumme an TSS
  steht schon im Verlauf.
* **iCloud-Abgleich**, damit am Mac gebaute Programme auf dem Apple TV auftauchen.
  Heute ist jedes Gerät eine Insel. `NSUbiquitousKeyValueStore` passt genau auf
  die bestehende `KeyValueStorage`-Schnittstelle.
* **Kalibrierung / Spin-Down** über den Control Point (`0x13`).
* **Herzfrequenzzonen** zusätzlich zu den Leistungszonen; Maximal- und Ruhepuls
  stehen bereits im Profil.
* **Mehrere Fahrerprofile** für den gemeinsamen Keller.
* **Audio- und Sprachansagen** vor Blockwechseln – auf dem Apple TV, wo man den
  Bildschirm nicht immer ansieht, wahrscheinlich wichtiger als gedacht.
