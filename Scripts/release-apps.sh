#!/usr/bin/env bash
#
# Archiviert die Apps, exportiert sie und lädt sie zu App Store Connect hoch.
#
#     Scripts/release-apps.sh            # alle drei
#     Scripts/release-apps.sh mac        # nur macOS
#     Scripts/release-apps.sh tv         # nur tvOS
#     Scripts/release-apps.sh ios        # nur iPhone und iPad
#
# Voraussetzungen:
#   - ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
#   - Zertifikate "Apple Distribution" und "Mac Installer Distribution" des
#     Teams im Schlüsselbund (Xcode -> Settings -> Apple Accounts ->
#     Manage Certificates)
#   - tvOS-Store-Profil: Scripts/make-profile.js TVOS_APP_STORE "Wattwerk tvOS App Store"
#   - iOS-Store-Profil:  Scripts/make-profile.js IOS_APP_STORE "Wattwerk iOS App Store"

set -euo pipefail

TEAM_ID="4R6MBU349U"
KEY_ID="PWF9SDKK9M"
ISSUER_ID="111736bf-f38e-4a94-b110-ffd4123b9451"
APP_ID="6814144845"   # Wattwerk in App Store Connect
TVOS_PROFILE="Wattwerk tvOS App Store"
IOS_PROFILE="Wattwerk iOS App Store"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/Apps/Wattwerk.xcodeproj"
OUT="${TMPDIR:-/tmp}/wattwerk-release"
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"

AUTH=(-authenticationKeyPath "$KEY_PATH"
      -authenticationKeyID "$KEY_ID"
      -authenticationKeyIssuerID "$ISSUER_ID")

# Xcodes Verpackungsschritt ruft /usr/bin/rsync (openrsync) auf und reicht -E
# als --extended-attributes weiter. Liegt eine neuere rsync im PATH, wird die
# als Gegenstelle benutzt, kennt die Option nicht, und der Export scheitert mit
# dem nichtssagenden "Copy failed". Ein aufgeräumter PATH umgeht das.
CLEAN_PATH="/usr/bin:/bin:/usr/sbin:/sbin"

die() { echo "FEHLER: $*" >&2; exit 1; }
[ -f "$KEY_PATH" ] || die "API-Schlüssel fehlt: $KEY_PATH"

release_mac() {
    echo "==> macOS archivieren"
    rm -rf "$OUT/mac.xcarchive" "$OUT/mac"
    xcodebuild -project "$PROJECT" -scheme "Wattwerk (Mac)" \
        -destination 'generic/platform=macOS' \
        -archivePath "$OUT/mac.xcarchive" \
        -allowProvisioningUpdates "${AUTH[@]}" archive

    cat > "$OUT/mac-export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>method</key><string>app-store-connect</string>
    <key>teamID</key><string>$TEAM_ID</string>
    <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

    echo "==> macOS exportieren"
    env PATH="$CLEAN_PATH" xcodebuild -exportArchive \
        -archivePath "$OUT/mac.xcarchive" \
        -exportOptionsPlist "$OUT/mac-export.plist" \
        -exportPath "$OUT/mac" \
        -allowProvisioningUpdates "${AUTH[@]}"

    echo "==> macOS prüfen und hochladen"
    xcrun altool --validate-app -f "$OUT/mac/Wattwerk.pkg" -t macos \
        --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
    xcrun altool --upload-app -f "$OUT/mac/Wattwerk.pkg" -t macos \
        --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
}

release_tv() {
    echo "==> tvOS archivieren"
    # Von Hand signiert: bei automatischer Signatur verlangt Xcode beim
    # Archivieren ein Entwicklungsprofil und scheitert daran, dass für den
    # Apple TV kein Gerät registriert ist. Für den Store braucht es das
    # ohnehin nicht.
    rm -rf "$OUT/tv.xcarchive" "$OUT/tv"
    xcodebuild -project "$PROJECT" -scheme "Wattwerk (TV)" \
        -destination 'generic/platform=tvOS' \
        -archivePath "$OUT/tv.xcarchive" \
        CODE_SIGN_STYLE=Manual \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        "CODE_SIGN_IDENTITY=Apple Distribution" \
        "PROVISIONING_PROFILE_SPECIFIER=$TVOS_PROFILE" \
        archive

    cat > "$OUT/tv-export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>method</key><string>app-store-connect</string>
    <key>teamID</key><string>$TEAM_ID</string>
    <key>signingStyle</key><string>manual</string>
    <key>signingCertificate</key><string>Apple Distribution</string>
    <key>provisioningProfiles</key>
    <dict><key>de.eliaspeeters.wattwerk</key><string>$TVOS_PROFILE</string></dict>
    <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

    echo "==> tvOS exportieren"
    env PATH="$CLEAN_PATH" xcodebuild -exportArchive \
        -archivePath "$OUT/tv.xcarchive" \
        -exportOptionsPlist "$OUT/tv-export.plist" \
        -exportPath "$OUT/tv"

    echo "==> tvOS prüfen und hochladen"
    xcrun altool --validate-app -f "$OUT/tv/Wattwerk.ipa" -t tvos \
        --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
    xcrun altool --upload-app -f "$OUT/tv/Wattwerk.ipa" -t tvos \
        --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
}

release_ios() {
    echo "==> iOS archivieren"
    # Von Hand signiert, aus demselben Grund wie tvOS: ohne registriertes
    # iPhone gibt es kein Entwicklungsprofil, und das Store-Profil reicht.
    rm -rf "$OUT/ios.xcarchive" "$OUT/ios"
    xcodebuild -project "$PROJECT" -scheme "Wattwerk (iOS)" \
        -destination 'generic/platform=iOS' \
        -archivePath "$OUT/ios.xcarchive" \
        CODE_SIGN_STYLE=Manual \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        "CODE_SIGN_IDENTITY=Apple Distribution" \
        "PROVISIONING_PROFILE_SPECIFIER=$IOS_PROFILE" \
        archive

    cat > "$OUT/ios-export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>method</key><string>app-store-connect</string>
    <key>teamID</key><string>$TEAM_ID</string>
    <key>signingStyle</key><string>manual</string>
    <key>signingCertificate</key><string>Apple Distribution</string>
    <key>provisioningProfiles</key>
    <dict><key>de.eliaspeeters.wattwerk</key><string>$IOS_PROFILE</string></dict>
    <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

    echo "==> iOS exportieren"
    env PATH="$CLEAN_PATH" xcodebuild -exportArchive \
        -archivePath "$OUT/ios.xcarchive" \
        -exportOptionsPlist "$OUT/ios-export.plist" \
        -exportPath "$OUT/ios"

    # Die App-ID ausdrücklich: altool sucht den Eintrag sonst über Bundle-ID
    # und Plattform und findet für iOS keinen, solange dort noch keine
    # Version angelegt ist - obwohl der Eintrag derselbe ist.
    echo "==> iOS hochladen"
    xcrun altool --upload-app -f "$OUT/ios/Wattwerk.ipa" -t ios \
        --apple-id "$APP_ID" \
        --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
}

mkdir -p "$OUT"
case "${1:-alle}" in
    mac) release_mac ;;
    tv)  release_tv ;;
    ios) release_ios ;;
    *)   release_mac; release_tv; release_ios ;;
esac

echo
echo "Fertig. Die Builds erscheinen nach ein paar Minuten Verarbeitung in App Store Connect."
