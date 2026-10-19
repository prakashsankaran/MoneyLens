#!/usr/bin/env bash
# Installs the test build on an Android emulator, opens it and checks that the
# sign-in screen appears. Leaves a screenshot,
# the screen's text and the app's log in apps/android/smoke/.
set -euo pipefail
cd "$(dirname "$0")/.."
APK=android/app/build/outputs/apk/debug/app-debug.apk
PKG=app.moneylens.android.test
mkdir -p smoke

adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/app.moneylens.android.MainActivity"

found=""
for _ in $(seq 1 30); do
  sleep 3
  # uiautomator can exit 0 without writing the file ("could not get idle state"),
  # so a failed pull just means "try again".
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/ui.xml smoke/ui.xml >/dev/null 2>&1 || continue
  if grep -q "Sign in" smoke/ui.xml; then
    found=yes
    break
  fi
done

adb exec-out screencap -p > smoke/launch.png
adb logcat -d > smoke/logcat.txt
echo "--- app log ---"
grep -E "Capacitor|chromium|Console" smoke/logcat.txt | tail -60 || true
python3 - <<'PY'
import base64, io
from PIL import Image
img = Image.open('smoke/launch.png').convert('RGB')
img.thumbnail((360, 800))
buf = io.BytesIO()
img.save(buf, 'JPEG', quality=70)
print('SCREENSHOT_BASE64_BEGIN')
print(base64.b64encode(buf.getvalue()).decode())
print('SCREENSHOT_BASE64_END')
PY

if [ -z "$found" ]; then
  echo "The sign-in screen did not appear" >&2
  exit 1
fi
echo "MoneyLens opened on the emulator and showed the sign-in screen."

# The signed release is the file friends download, so check that it installs
# and opens too, as a fresh install the way a phone does it.
RELEASE_APK=${RELEASE_APK:-}
if [ -n "$RELEASE_APK" ] && [ -f "$RELEASE_APK" ]; then
  adb uninstall app.moneylens.android >/dev/null 2>&1 || true
  adb install "$RELEASE_APK"
  adb shell am start -W -n "app.moneylens.android/.MainActivity"
  sleep 5
  if ! adb shell pidof app.moneylens.android >/dev/null; then
    echo "The release APK installed but did not stay open" >&2
    exit 1
  fi
  echo "The signed release APK installed and opened on the emulator."
fi
