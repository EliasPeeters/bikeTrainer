#!/bin/bash
# Verkleinert die Rohaufnahmen für die Landingpage: 1760 px breit, WebP.
# Die Store-Bilder bleiben unangetastet - die brauchen volle Auflösung, die
# Seite nicht.
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/assets/screenshots"
OUT="$ROOT/packages/landingpage/public/shots"
WIDTH=1760

mkdir -p "$OUT"

# sips kann WebP nicht schreiben, cwebp schon. Es kommt mit Homebrew
# (`brew install webp`) und skaliert gleich mit.
shrink () { # quelle ziel
  cwebp -quiet -q 80 -resize $WIDTH 0 "$1" -o "$2"
  printf "  %-24s %s\n" "$(basename "$2")" "$(du -h "$2" | cut -f1)"
}

shrink "$SRC/macos/01-bibliothek.png"  "$OUT/mac-bibliothek.webp"
shrink "$SRC/macos/02-programm.png"    "$OUT/mac-programm.webp"
shrink "$SRC/macos/03-editor.png"      "$OUT/mac-editor.webp"
shrink "$SRC/macos/04-fahrt.png"       "$OUT/mac-fahrt.webp"
shrink "$SRC/macos/05-auswertung.png"  "$OUT/mac-auswertung.webp"
shrink "$SRC/macos/06-verlauf.png"     "$OUT/mac-verlauf.webp"
shrink "$SRC/macos/07-geraete.png"     "$OUT/mac-geraete.webp"
shrink "$SRC/tvos/01-bibliothek.png"   "$OUT/tv-bibliothek.webp"
shrink "$SRC/tvos/03-fahrt.png"        "$OUT/tv-fahrt.webp"

echo "Fertig: $OUT"
