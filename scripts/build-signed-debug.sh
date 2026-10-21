#!/bin/bash
# Builds a signed debug Ensayo.app so the microphone permission behaves the way users get it and survives rebuilds.
# Uses the free self-signed code-signing certificate already in this Mac's keychain (see "Carried over from Talaan" in
# Notion). The first run may ask to let codesign use the key: choose Always Allow.
set -euo pipefail
cd "$(dirname "$0")/.."
IDENTITY="${APPLE_SIGNING_IDENTITY:-Parlato Code Signing}"
APPLE_SIGNING_IDENTITY="$IDENTITY" npm run tauri build -- --debug --bundles app
APP="src-tauri/target/debug/bundle/macos/Ensayo.app"
codesign --verify --deep --strict "$APP" && echo "signature ok"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q "device.audio-input" && echo "microphone entitlement ok"
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" "$APP/Contents/Info.plist" >/dev/null && echo "microphone usage string ok"
echo "$APP"
