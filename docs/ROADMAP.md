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

## Konto, Abgleich und Portal

* **Tokens in den Schlüsselbund.** Sie liegen heute im normalen App-Speicher –
  auf dem Mac in der Sandbox, auf dem Apple TV in `UserDefaults`. Für den
  Anfang tragbar, auf Dauer gehört so etwas in den Keychain.
* **Passwort vergessen.** Fehlt komplett, und ohne Mailversand geht es auch
  nicht.
* **Sammlungen in der App bearbeiten.** Sie werden dort angezeigt und lassen
  sich fahren, angelegt und gefüllt werden sie bisher nur im Web-Portal.
* **Grabsteine für gelöschte Programme.** Der Abgleich löst den Normalfall über
  `syncedAt`, aber zwei Geräte, die gleichzeitig offline etwas ändern, brauchen
  mehr als „wer zuletzt schreibt".
* **Ratenbegrenzung in einen gemeinsamen Speicher**, sobald mehr als eine
  Instanz läuft – heute zählt jeder Prozess für sich.
* **Echte Empfehlungen.** Die Reihen sind heute Heuristiken. Mit etwas
  Nutzungsverlauf ließe sich mehr daraus machen – etwa Programme, die zur
  aktuellen Wochenbelastung passen.

## Später

* **Streckenmodus** statt ERG: Der Control-Point-Befehl für Simulationsparameter
  (`0x11`) ist implementiert, aber ungenutzt. Damit ließe sich eine Steigung
  fahren statt einer festen Wattzahl.
* **Trainingsplan über Wochen** mit Belastungsverlauf. Die Wochenvorlage gibt
  es seit 1.1; was fehlt, ist ein Aufbau über mehrere Wochen (Aufbau,
  Entlastung) und einzelne Wochen, die von der Vorlage abweichen.
* **Wochenplan als MCP-Werkzeug.** App und Portal nutzen `/plan`, der
  MCP-Server noch nicht. Gerade für ein Sprachmodell wäre „plan mir eine Woche“
  naheliegend.
* **Durch die Wochen blättern in den Apps.** Das Portal kann es schon; in den
  Apps gibt es nur die laufende Woche.
* **iCloud-Abgleich**, damit am Mac gebaute Programme auf dem Apple TV auftauchen.
  Heute ist jedes Gerät eine Insel. `NSUbiquitousKeyValueStore` passt genau auf
  die bestehende `KeyValueStorage`-Schnittstelle.
* **Kalibrierung / Spin-Down** über den Control Point (`0x13`).
* **Herzfrequenzzonen** zusätzlich zu den Leistungszonen; Maximal- und Ruhepuls
  stehen bereits im Profil.
* **Mehrere Fahrerprofile** für den gemeinsamen Keller.
* **Audio- und Sprachansagen** vor Blockwechseln – auf dem Apple TV, wo man den
  Bildschirm nicht immer ansieht, wahrscheinlich wichtiger als gedacht.
