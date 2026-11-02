#!/usr/bin/env bash
set -euo pipefail

# Public certificate SHA-256 from the original 70,070,208-byte full APK.
# This is a public identity pin, never a private signing key.
EXPECTED_CERT=c9cd68695f31074bb60953e41c02bf84b599a201c8e990b0ba4566b441a943ea
SDK_ROOT=${ANDROID_SDK_ROOT:-${ANDROID_HOME:?Android SDK must be installed}}
BUILD_TOOLS=$(find "$SDK_ROOT/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
APK=android-lite/android/app/build/outputs/apk/release/app-release.apk

verify_cert() {
    local file="$1" actual report
    report=$("$BUILD_TOOLS/apksigner" verify --print-certs "$file")
    printf '%s\n' "$report"
    # Build-tools use prefixes such as Signer #1, V2 Signer, or SDK-bounded signers.
    # Check every unique signer certificate; never accept a missing digest.
    actual=$(printf '%s\n' "$report" | sed -nE 's/^.*Signer.*certificate SHA-256 digest: ([0-9a-fA-F]+).*$/\1/p' | tr 'A-F' 'a-f' | sort -u)
    test "$actual" = "$EXPECTED_CERT" || { echo "Signing identity mismatch: $file" >&2; exit 1; }
    echo "Verified original signing identity: $actual"
}
verify_cert "$APK"
BADGING=$("$BUILD_TOOLS/aapt" dump badging "$APK")
EXPECTED_CODE=$(sed -n 's/.*versionCode \([0-9]*\).*/\1/p' android-lite/android/app/build.gradle)
EXPECTED_VERSION=$(sed -n 's/.*versionName "\([^"]*\)".*/\1/p' android-lite/android/app/build.gradle)
printf '%s\n' "$BADGING" | sed -n '1p' | grep -F "name='com.period.app' versionCode='$EXPECTED_CODE' versionName='$EXPECTED_VERSION'"
test "$EXPECTED_CODE" -gt 2

# Verify compiled adaptive resources, not just source XML.
for icon in ic_launcher ic_launcher_round; do
    "$BUILD_TOOLS/aapt" dump xmltree "$APK" "res/mipmap-anydpi-v26/$icon.xml" | grep 'E: adaptive-icon'
    "$BUILD_TOOLS/aapt" dump xmltree "$APK" "res/mipmap-anydpi-v33/$icon.xml" | grep 'E: monochrome'
done

# During retirement, also cryptographically verify the actual old full APK
# before deleting its release asset. Future builds use the same pinned identity.
FULL=$(gh release view android-v1.0.0 -R "$GITHUB_REPOSITORY" --json assets --jq '.assets[] | select(.name == "Period-1.0.0-android.apk") | .name')
if [ -n "$FULL" ]; then
    reference_dir=$(mktemp -d)
    trap 'rm -rf "$reference_dir"' EXIT
    gh release download android-v1.0.0 -R "$GITHUB_REPOSITORY" --pattern "$FULL" --dir "$reference_dir"
    verify_cert "$reference_dir/$FULL"
    "$BUILD_TOOLS/aapt" dump badging "$reference_dir/$FULL" | sed -n '1p' | grep "name='com.period.app'"
fi
