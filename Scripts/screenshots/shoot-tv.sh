#!/bin/bash
# Nimmt die tvOS-Screenshots auf. Vorher den Treiber einsetzen:
#
#   cp Scripts/screenshots/ScreenshotDriver.swift Sources/WattwerkUI/
#   git apply Scripts/screenshots/hooks.patch
#
# Danach beides wieder entfernen - der Treiber gehört in keinen Release-Build.
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$ROOT/.build/screenshots"
OUT="$WORK/tv"
BUNDLE=de.eliaspeeters.wattwerk
APP="$WORK/dd-tv/Build/Products/Release-appletvsimulator/Wattwerk.app"

# Simulator: erstes verfügbares Apple-TV-Gerät, oder als Argument übergeben.
DEVICE="${1:-$(xcrun simctl list devices available | grep -m1 "Apple TV" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')}"
[ -n "$DEVICE" ] || { echo "Kein Apple-TV-Simulator gefunden." >&2; exit 1; }

mkdir -p "$OUT"
xcrun simctl boot "$DEVICE" 2>/dev/null || true

xcodebuild -project "$ROOT/Apps/Wattwerk.xcodeproj" \
  -scheme "Wattwerk (TV)" -configuration Release \
  -destination "id=$DEVICE" -derivedDataPath "$WORK/dd-tv" build >/dev/null

# Frisch installieren: der Treiber legt den Verlauf nur an, wenn noch keiner da ist.
xcrun simctl uninstall "$DEVICE" $BUNDLE >/dev/null 2>&1 || true
xcrun simctl install "$DEVICE" "$APP"

shoot () { # szene dateiname [wartezeit]
  xcrun simctl terminate "$DEVICE" $BUNDLE >/dev/null 2>&1 || true
  sleep 1
  SIMCTL_CHILD_WATTWERK_SHOT="$1" xcrun simctl launch "$DEVICE" $BUNDLE >/dev/null
  sleep "${3:-7}"
  xcrun simctl io "$DEVICE" screenshot "$OUT/$2.png" >/dev/null 2>&1
  echo "  $2"
}

shoot seed _seed 45
for szene in library detail ride summary devices history profile account; do
  shoot "$szene" "$szene"
done
rm -f "$OUT/_seed.png"

echo "Fertig: $OUT"
