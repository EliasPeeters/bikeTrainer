#!/bin/bash
# Nimmt die macOS-Screenshots auf. Vorher den Treiber einsetzen:
#
#   cp Scripts/screenshots/ScreenshotDriver.swift Sources/WattwerkUI/
#   git apply Scripts/screenshots/hooks.patch
#
# Danach beides wieder entfernen - der Treiber gehört in keinen Release-Build.
#
# Voraussetzung: das aufrufende Programm (Terminal, Editor, Agent) braucht in
# Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- &
# Systemaudioaufnahme ein Häkchen. Ohne das antwortet `screencapture` mit
# "could not create image from display".
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$ROOT/.build/screenshots"
OUT="$WORK/mac"
# Eigene Bundle-ID: die Screenshot-Läufe legen einen Verlauf an, der nichts im
# Ablageort der richtigen App zu suchen hat.
BUNDLE=de.eliaspeeters.wattwerk.shots
APP="$WORK/dd-mac/Build/Products/Release/Wattwerk.app"
# 1440 × 900 Punkte, auf einem Retina-Bildschirm also 2880 × 1800 Pixel - eine
# der Größen, die App Store Connect für macOS annimmt.
SIZE=${SIZE:-1440x900}

mkdir -p "$OUT"

xcodebuild -project "$ROOT/Apps/Wattwerk.xcodeproj" \
  -scheme "Wattwerk (Mac)" -configuration Release \
  -derivedDataPath "$WORK/dd-mac" \
  PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE build >/dev/null

# Kleiner Helfer: die CGWindowID des Fensters. `screencapture -l` will eine.
cat > "$WORK/winid.swift" <<'SWIFT'
import CoreGraphics
import Foundation
guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for info in list {
    guard let name = info[kCGWindowOwnerName as String] as? String, name == "Wattwerk",
          let layer = info[kCGWindowLayer as String] as? Int, layer == 0,
          let number = info[kCGWindowNumber as String] as? Int,
          let bounds = info[kCGWindowBounds as String] as? [String: Any],
          let width = bounds["Width"] as? Double, width > 400 else { continue }
    print(number)
    exit(0)
}
exit(1)
SWIFT
swiftc -O -o "$WORK/winid" "$WORK/winid.swift"

shoot () { # szene dateiname [wartezeit]
  pkill -f "$WORK/dd-mac" 2>/dev/null || true
  sleep 1
  open -n --env WATTWERK_SHOT="$1" --env WATTWERK_SHOT_SIZE=$SIZE "$APP"
  sleep "${3:-8}"
  id=$("$WORK/winid") || { echo "  $2: kein Fenster gefunden" >&2; return 1; }
  screencapture -x -o -l "$id" "$OUT/$2.png"
  echo "  $2"
}

shoot seed _seed 60
for szene in library editor detail ride summary devices history profile account; do
  shoot "$szene" "$szene"
done
pkill -f "$WORK/dd-mac" 2>/dev/null || true
rm -f "$OUT/_seed.png"

echo "Fertig: $OUT"
