# Store-Grafiken

Das, was in App Store Connect hochgeladen wird: Aufnahme, Überschrift, ein Satz
Erklärung, Hintergrund in der Logofarbe. Die nackten Aufnahmen liegen daneben in
[`../screenshots/`](../screenshots/).

| Ordner | Größe | Anzahl |
|---|---|---|
| `macos/` | 2880 × 1800 px | 9 |
| `tvos/` | 3840 × 2160 px | 7 |

App Store Connect nimmt für macOS 1280 × 800, 1440 × 900, 2560 × 1600 und
2880 × 1800, für Apple TV 1920 × 1080 und 3840 × 2160. Die Nummerierung ist die
vorgeschlagene Reihenfolge im Eintrag; Apple zeigt höchstens zehn Bilder.

## Neu bauen

```bash
node Scripts/screenshots/store-graphics.mjs
```

Überschriften und Nebensätze stehen im Kopf des Skripts. Gerendert wird mit
Chrome im Headless-Modus: der kürzeste Weg zu verlässlicher Typografie in
exakten Pixelmaßen. Das Skript setzt voraus, dass die Aufnahmen unter
`assets/screenshots/` schon liegen — wie sie entstehen, steht in
[`../screenshots/README.md`](../screenshots/README.md).
