#!/usr/bin/env bash
# build-macOSApp.sh
# (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
#
# Builds pfodProxy for macOS (universal binary: x86_64 + arm64) and wraps
# it in a minimal pfodProxy.app bundle so users can launch it from Finder
# without opening Terminal manually.  pfodWeb.html is NOT included — it is
# distributed separately with the pfodParser Arduino library.
#
# Bundle layout:
#   pfodProxy.app/
#     Contents/
#       Info.plist
#       MacOS/
#         pfodProxyLauncher  (CFBundleExecutable — tiny C launcher, always exits fast)
#         pfodProxy        (long-running server, launched by pfodProxyLauncher)
#         run-pfodProxy.sh (shell script run by Terminal; closes window when done)
#
# pfodProxyLauncher behaviour:
#   • pfodProxy already running → exit silently (nothing to open — pfodWeb.html
#     is not served by pfodProxy; user opens it from their Arduino library folder)
#   • pfodProxy not running     → fork pfodProxy into a real Terminal window via
#     osascript so that macOS grants it Local Network permission (NECP)
#
# Steps:
#   1. Build pfodProxy via pfodProxy_rs/build-pfodProxy.sh
#   2. Compile pfodProxyLauncher.c with the system cc
#   3. Assemble .app bundle
#   4. Package as pfodWeb-<version>-macOS.tar.gz
#
# Usage:
#   chmod +x build-macOSApp.sh
#   ./build-macOSApp.sh

set -euo pipefail

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
OUTDIR="$ROOT/macOS"

echo "========================================"
echo "  pfodWeb macOS App Builder"
echo "========================================"
echo ""

# ── Clear the output dir ─────────────────────────────────────────────────────
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH" >&2
    exit 1
fi

if ! command -v cc &>/dev/null; then
    echo "ERROR: cc not found — install Xcode Command Line Tools:" >&2
    echo "  xcode-select --install" >&2
    exit 1
fi

# ── Extract version ──────────────────────────────────────────────────────────

VERSION="$(node -e "
var fs=require('fs');
var m=fs.readFileSync('$ROOT/pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);
if(!m){process.stderr.write('ERROR: version not found in pfodWeb_src/version.js\n');process.exit(1);}
process.stdout.write(m[1]);
")"
echo "Version: $VERSION"
echo ""

# ── Step 1: Build pfodProxy ──────────────────────────────────────────────────

echo "========================================"
echo "  Step 1: Building pfodProxy"
echo "========================================"
echo ""

if ! (cd "$ROOT/pfodProxy_rs" && bash build-pfodProxy.sh); then
    echo "" >&2
    echo "ERROR: pfodProxy build failed (see errors above)" >&2
    exit 1
fi
echo ""

PROXY_BIN="$ROOT/pfodProxy"
if [ ! -f "$PROXY_BIN" ]; then
    echo "ERROR: $PROXY_BIN not found after build" >&2
    exit 1
fi

# ── Step 2: Compile pfodProxyLauncher ─────────────────────────────────────────

echo "========================================"
echo "  Step 2: Compiling pfodProxyLauncher"
echo "========================================"
echo ""

LAUNCHER_C="$(mktemp /tmp/pfodProxyLauncher_XXXXXX.c)"
LAUNCHER_BIN="$(mktemp /tmp/pfodProxyLauncher_XXXXXX)"

# Launcher: if pfodProxy is already running, exit silently — the user already
# has pfodWeb.html open from their Arduino library folder, nothing to open.
# If pfodProxy is not running, use osascript to open a Terminal window running
# run-pfodProxy.sh so that macOS grants the process Local Network permission.
cat > "$LAUNCHER_C" <<'CSRC'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <mach-o/dyld.h>

int main(void) {
    /* pfodProxy already running — nothing to do. */
    if (system("pgrep -xq pfodProxy") == 0) {
        return 0;
    }

    /* Resolve path to run-pfodProxy.sh (next to this launcher in Contents/MacOS/). */
    char self[4096];
    uint32_t len = (uint32_t)sizeof(self);
    if (_NSGetExecutablePath(self, &len) != 0) return 1;
    char *slash = strrchr(self, '/');
    if (!slash) return 1;
    strcpy(slash + 1, "run-pfodProxy.sh");

    /* Shell-quote the path so Terminal's shell treats it as one argument
     * even when the install path contains spaces. */
    char shellQuoted[8192];
    char *o = shellQuoted;
    *o++ = '\'';
    for (char *p = self; *p && (size_t)(o - shellQuoted) < sizeof(shellQuoted) - 6; p++) {
        if (*p == '\'') { *o++ = '\''; *o++ = '\\'; *o++ = '\''; *o++ = '\''; }
        else *o++ = *p;
    }
    *o++ = '\'';
    *o = '\0';

    /* AppleScript-escape (" and \) for embedding inside the do-script literal. */
    char escaped[8192];
    o = escaped;
    for (char *p = shellQuoted; *p && (size_t)(o - escaped) < sizeof(escaped) - 2; p++) {
        if (*p == '"' || *p == '\\') *o++ = '\\';
        *o++ = *p;
    }
    *o = '\0';

    char script[8192];
    snprintf(script, sizeof(script),
        "tell application \"Terminal\" to do script \"%s\"", escaped);

    execlp("osascript", "osascript", "-e", script, (char *)NULL);
    return 1;
}
CSRC

if ! cc -o "$LAUNCHER_BIN" "$LAUNCHER_C" 2>&1; then
    echo "" >&2
    echo "ERROR: pfodProxyLauncher compilation failed (see errors above)" >&2
    rm -f "$LAUNCHER_C" "$LAUNCHER_BIN"
    exit 1
fi
rm -f "$LAUNCHER_C"
echo "  ✓ Compiled pfodProxyLauncher"
echo ""

# ── Step 3: Assemble .app bundle ─────────────────────────────────────────────

echo "========================================"
echo "  Step 3: Assembling .app bundle"
echo "========================================"
echo ""

APP_NAME="pfodProxy"
APP_DIR="$OUTDIR/${APP_NAME}.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"

mkdir -p "$MACOS_DIR"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>pfodProxy</string>
    <key>CFBundleIdentifier</key>
    <string>au.com.forward.pfodProxy</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleExecutable</key>
    <string>pfodProxyLauncher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.12</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <true/>
    <key>NSBluetoothAlwaysUsageDescription</key>
    <string>pfodProxy uses Bluetooth to connect to pfod-compatible Arduino devices.</string>
    <key>NSBluetoothPeripheralUsageDescription</key>
    <string>pfodProxy uses Bluetooth to connect to pfod-compatible Arduino devices.</string>
    <key>NSLocalNetworkUsageDescription</key>
    <string>pfodProxy needs to connect to pfod-compatible devices on your local network.</string>
</dict>
</plist>
PLIST

echo "  ✓ Created Info.plist (version $VERSION)"

cp -f "$LAUNCHER_BIN" "$MACOS_DIR/pfodProxyLauncher"
chmod +x "$MACOS_DIR/pfodProxyLauncher"
rm -f "$LAUNCHER_BIN"
echo "  ✓ Copied pfodProxyLauncher"

cp -f "$PROXY_BIN" "$MACOS_DIR/pfodProxy"
chmod +x "$MACOS_DIR/pfodProxy"
echo "  ✓ Copied pfodProxy"

cat > "$MACOS_DIR/run-pfodProxy.sh" <<'SHC'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/pfodProxy"
MY_TTY="$(tty)"
osascript -e "tell application \"Terminal\" to close (first window whose tabs contains (first tab whose tty is \"$MY_TTY\"))" >/dev/null 2>&1
SHC
chmod +x "$MACOS_DIR/run-pfodProxy.sh"
echo "  ✓ Created run-pfodProxy.sh"

echo ""

codesign -s - --force --deep "$APP_DIR"
echo "  ✓ Signed pfodProxy.app (ad-hoc)"

echo ""

# ── Step 4: Package as .tar.gz ───────────────────────────────────────────────

echo "========================================"
echo "  Step 4: Creating .tar.gz"
echo "========================================"
echo ""

ARCHIVE="$OUTDIR/pfodProxy-${VERSION}-macOS.tar.gz"

tar -czf "$ARCHIVE" -C "$OUTDIR" "${APP_NAME}.app"

ARCHIVE_KB=$(du -k "$ARCHIVE" | cut -f1)
echo "  ✓ Created $(basename "$ARCHIVE") (${ARCHIVE_KB} KB)"
echo ""

rm -rf "$APP_DIR"

echo "========================================"
echo "  macOS App Build Complete!"
echo "========================================"
echo ""
echo "Output: macOS/pfodProxy-${VERSION}-macOS.tar.gz"
echo ""
echo "Contents:"
tar -tzf "$ARCHIVE"
echo ""
exit 0
