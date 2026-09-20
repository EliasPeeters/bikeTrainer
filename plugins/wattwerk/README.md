# Wattwerk für Claude Code

Verbindet Claude Code mit deinem [Wattwerk](https://wattwerk.eliaspeeters.de)-Konto:
Verlauf und Wochenbelastung lesen, die Bibliothek durchsuchen, eigene
Trainingsprogramme anlegen und ändern, Sammlungen pflegen.

## Einrichten

```bash
claude plugin marketplace add EliasPeeters/bikeTrainer
claude plugin install wattwerk@wattwerk
```

Dann einen Zugangsschlüssel anlegen – im Portal unter
[Profil → Zugangsschlüssel](https://wattwerk.eliaspeeters.de/app/profil) – und
in die Shell-Konfiguration eintragen:

```bash
export WATTWERK_API_KEY=wk_...
```

Claude Code neu starten. `/mcp` zeigt `wattwerk` dann als `connected`.

Wer nur lesen lassen will, wählt beim Anlegen *Rechte: Nur lesen*. Der
Assistent sieht dann Verlauf und Bibliothek, kann aber nichts anlegen, ändern
oder löschen.

## Ausprobieren

* „Zeig mir meine letzten Einheiten und die Belastung der letzten Woche."
* „Such öffentliche Programme unter 45 Minuten mit Schwellenintervallen."
* „Bau mir ein 4×8 bei 100 % FTP mit 4 Minuten Pause und leg es an."
* „Mach aus meinen drei kürzesten Programmen eine Sammlung ‚Kurze Woche'."

## Eigene Installation

Die Adresse des MCP-Servers steht fest in `.mcp.json`. Variablen werden dort
zwar in `headers` aufgelöst, aber **nicht** im `url`-Feld (geprüft mit Claude
Code 2.0.76) – ein `${WATTWERK_MCP_URL}` bliebe stehen, wie es dasteht. Wer
einen eigenen Wattwerk-Stack betreibt, trägt den Server deshalb direkt ein,
statt das Plugin zu benutzen:

```bash
claude mcp add --transport http wattwerk https://mcp.example.com/mcp \
  --header "Authorization: Bearer wk_..."
```
