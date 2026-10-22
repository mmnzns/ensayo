#!/bin/sh
# Fails the build unless the Mac app is signed by the expected certificate (not ad-hoc) and keeps the
# microphone entitlement. When APPLE_SIGNING_IDENTITY is unset the build is ad-hoc on purpose: say so and pass.
set -eu
app="$1"
codesign --verify --deep --strict "$app"
info=$(codesign -dv --verbose=2 "$app" 2>&1)
echo "$info" | grep -E "^(Authority|Signature|TeamIdentifier|Runtime|Identifier)" || true
if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "::warning::no APPLE_SIGNING_IDENTITY: the app is ad-hoc signed, so macOS asks for the microphone again after each update"
  exit 0
fi
echo "$info" | grep -q "^Authority=$APPLE_SIGNING_IDENTITY\$" || { echo "::error::not signed by $APPLE_SIGNING_IDENTITY"; exit 1; }
codesign -d --entitlements - --xml "$app" 2>/dev/null | grep -q "com.apple.security.device.audio-input" \
  || { echo "::error::the microphone entitlement is missing, so a signed build cannot hear anyone"; exit 1; }
echo "Signed by $APPLE_SIGNING_IDENTITY with the microphone entitlement."
