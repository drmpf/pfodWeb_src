#!/usr/bin/env bash
# build-macOSApp.sh
# (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
#
# Builds a macOS .app bundle containing pfodProxy and pfodWeb.html,
# then packages it as a .tar.gz for distribution.
#
# Bundle layout:
#   pfodWeb.app/
#     Contents/
#       Info.plist
#       MacOS/
#         pfodWebLauncher  (CFBundleExecutable — tiny C launcher, always exits fast)
#         pfodProxy        (long-running server, launched by pfodWebLauncher)
#         pfodWeb.html
#         extraFonts/      (optional external font subsets, copied if present)
#
# pfodWebLauncher behaviour:
#   • pfodProxy already running → open browser to existing instance, exit 0
#   • pfodProxy not running     → fork pfodProxy into background, exit 0
#
# Because CFBundleExecutable (pfodWebLauncher) always exits quickly, macOS
# never has a long-running process associated with the bundle, so it always
# launches a fresh pfodWebLauncher on double-click — no "not responding" dialog.
#
# Steps:
#   1. Build pfodProxy via pfodProxy_rs/build-pfodProxy.sh
#   2. Build pfodWeb.html via pfodWeb_src/build.sh
#   3. Compile pfodWebLauncher.c with the system cc
#   4. Assemble .app bundle
#   5. Package as pfodWeb-<version>-macOS.tar.gz
#
# Usage:
#   chmod +x build-macOSApp.sh
#   ./build-macOSApp.sh

set -euo pipefail

# cd to the project root (dir containing this script)
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
OUTDIR="$ROOT/macOS"

echo "========================================"
echo "  pfodWeb macOS App Builder"
echo "========================================"
echo ""

# ── Clear the output dir first, so its mere existence/contents after this
# script exits is itself the signal that the build succeeded -- no stale
# files from a previous (possibly failed) run can be mistaken for fresh
# output.
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

# ── Prerequisites ────────────────────────────────────────────────────────────

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
var m=fs.readFileSync('pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);
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

# ── Step 2: Build pfodWeb.html ───────────────────────────────────────────────

echo "========================================"
echo "  Step 2: Building pfodWeb.html"
echo "========================================"
echo ""

if ! (cd "$ROOT/pfodWeb_src" && bash build.sh); then
    echo "" >&2
    echo "ERROR: pfodWeb build failed (see errors above)" >&2
    exit 1
fi
echo ""

# ── Verify build outputs exist ───────────────────────────────────────────────

PROXY_BIN="$ROOT/pfodProxy"
WEB_HTML="$ROOT/pfodWeb.html"

if [ ! -f "$PROXY_BIN" ]; then
    echo "ERROR: $PROXY_BIN not found after build" >&2
    exit 1
fi
if [ ! -f "$WEB_HTML" ]; then
    echo "ERROR: $WEB_HTML not found after build" >&2
    exit 1
fi

# ── Step 3: Compile pfodWebLauncher ─────────────────────────────────────────

echo "========================================"
echo "  Step 3: Compiling pfodWebLauncher"
echo "========================================"
echo ""

LAUNCHER_C="$(mktemp /tmp/pfodWebLauncher_XXXXXX.c)"
LAUNCHER_BIN="$(mktemp /tmp/pfodWebLauncher_XXXXXX)"

# Write launcher source.  The launcher:
#  1. Uses pgrep to check if pfodProxy is already running.
#  2. If yes: open browser to existing instance, exit.
#  3. If no: ask Terminal.app (via `osascript ... do script`) to open a
#     window and run pfodProxy there. `do script` returns as soon as
#     Terminal acknowledges the request — it does NOT wait for pfodProxy
#     to finish — so this launcher process exits quickly either way
#     (macOS never sees a long-running bundle process, so double-clicking
#     again while pfodProxy is running cleanly re-opens the browser
#     instead of macOS reporting "not responding"), while pfodProxy keeps
#     running as Terminal's own child after that.
#
#     This also gives the user a real terminal with visible log output
#     (no more /tmp/pfodProxy.log nobody cleans up), and — per the whole
#     macOS "Local Network" permission saga in this project's history —
#     processes launched from an actual Terminal session have reliably
#     never hit the NECP block that backgrounded/forked launches did, so
#     this also sidesteps that issue rather than working around it.
cat > "$LAUNCHER_C" <<'CSRC'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <mach-o/dyld.h>

int main(void) {
    /* Is pfodProxy already running? */
    if (system("pgrep -xq pfodProxy") == 0) {
        system("open http://127.0.0.1:4989/");
        return 0;
    }

    /* Resolve path to the run-pfodProxy.sh wrapper (next to this launcher
     * in Contents/MacOS/) — it runs pfodProxy and then closes this
     * Terminal window once pfodProxy exits. */
    char self[4096];
    uint32_t len = (uint32_t)sizeof(self);
    if (_NSGetExecutablePath(self, &len) != 0) return 1;
    char *slash = strrchr(self, '/');
    if (!slash) return 1;
    strcpy(slash + 1, "run-pfodProxy.sh");

    /* Shell-quote the path (wrap in '...', escaping any embedded ' as
     * '\'') so Terminal's shell treats it as one argument even if the
     * install path contains spaces. */
    char shellQuoted[8192];
    char *o = shellQuoted;
    *o++ = '\'';
    for (char *p = self; *p && (size_t)(o - shellQuoted) < sizeof(shellQuoted) - 6; p++) {
        if (*p == '\'') { *o++ = '\''; *o++ = '\\'; *o++ = '\''; *o++ = '\''; }
        else *o++ = *p;
    }
    *o++ = '\'';
    *o = '\0';

    /* AppleScript-escape (" and \) for embedding shellQuoted inside the
     * do-script string literal. */
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
    return 1; /* only reached if execlp itself failed */
}
CSRC

if ! cc -o "$LAUNCHER_BIN" "$LAUNCHER_C" 2>&1; then
    echo "" >&2
    echo "ERROR: pfodWebLauncher compilation failed (see errors above)" >&2
    rm -f "$LAUNCHER_C" "$LAUNCHER_BIN"
    exit 1
fi
rm -f "$LAUNCHER_C"
echo "  ✓ Compiled pfodWebLauncher"
echo ""

# ── Step 4: Assemble .app bundle ─────────────────────────────────────────────

echo "========================================"
echo "  Step 4: Assembling .app bundle"
echo "========================================"
echo ""

APP_NAME="pfodWeb"
APP_DIR="$OUTDIR/${APP_NAME}.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"

mkdir -p "$MACOS_DIR"

# Info.plist — CFBundleExecutable is the launcher, not pfodProxy directly
cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>pfodWeb</string>
    <key>CFBundleIdentifier</key>
    <string>au.com.forward.pfodWeb</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleExecutable</key>
    <string>pfodWebLauncher</string>
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

# Install launcher as CFBundleExecutable
cp -f "$LAUNCHER_BIN" "$MACOS_DIR/pfodWebLauncher"
chmod +x "$MACOS_DIR/pfodWebLauncher"
rm -f "$LAUNCHER_BIN"
echo "  ✓ Copied pfodWebLauncher (executable)"

# Copy pfodProxy
cp -f "$PROXY_BIN" "$MACOS_DIR/pfodProxy"
chmod +x "$MACOS_DIR/pfodProxy"
echo "  ✓ Copied pfodProxy (executable)"

# run-pfodProxy.sh — what the launcher actually hands to Terminal's
# `do script`.  Runs pfodProxy (so its output is visible in the window),
# then closes that same window once pfodProxy exits (e.g. via the
# "Close pfodProxy and pfodWeb" button) — identifying "this window" by
# its own tty rather than just "front window", since the user could have
# other Terminal windows open.  Without this, do-script-opened windows
# are left sitting at a bare shell prompt after the command finishes.
cat > "$MACOS_DIR/run-pfodProxy.sh" <<'SHC'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/pfodProxy"
MY_TTY="$(tty)"
osascript -e "tell application \"Terminal\" to close (first window whose tabs contains (first tab whose tty is \"$MY_TTY\"))" >/dev/null 2>&1
SHC
chmod +x "$MACOS_DIR/run-pfodProxy.sh"
echo "  ✓ Created run-pfodProxy.sh (executable)"

# Copy pfodWeb.html
cp -f "$WEB_HTML" "$MACOS_DIR/pfodWeb.html"
echo "  ✓ Copied pfodWeb.html"

# Copy extraFonts/ (optional — external font subsets pfodWeb.html links to)
if [ -d "$ROOT/extraFonts" ]; then
    cp -R "$ROOT/extraFonts" "$MACOS_DIR/extraFonts"
    echo "  ✓ Copied extraFonts/"

    # Copy the extraFonts usage guide into it
    if [ -f "$ROOT/docs/pfodWeb-extraFonts-guide.html" ]; then
        cp -f "$ROOT/docs/pfodWeb-extraFonts-guide.html" "$MACOS_DIR/extraFonts/pfodWeb-extraFonts-guide.html"
        echo "  ✓ Copied extraFonts/pfodWeb-extraFonts-guide.html"
    fi
fi

echo ""

# Ad-hoc sign the whole bundle (not just the individual binaries inside it).
# Without this, the bundle has no coherent code identity for TCC to attribute
# privacy requests (e.g. the macOS "Local Network" permission prompt) to —
# the request silently fails to prompt at all, with no System Settings entry,
# and the kernel drops outgoing LAN connections forever (NECP). Re-sign after
# every file is copied in, since adding files invalidates any earlier seal.
codesign -s - --force --deep "$APP_DIR"
echo "  ✓ Signed pfodWeb.app (ad-hoc)"

echo ""

# ── Step 5: Package as .tar.gz ───────────────────────────────────────────────

echo "========================================"
echo "  Step 5: Creating .tar.gz"
echo "========================================"
echo ""

ARCHIVE="$OUTDIR/pfodWeb-${VERSION}-macOS.tar.gz"

# Archive from OUTDIR so the path inside is pfodWeb.app/...
tar -czf "$ARCHIVE" -C "$OUTDIR" "${APP_NAME}.app"

ARCHIVE_KB=$(du -k "$ARCHIVE" | cut -f1)
echo "  ✓ Created $(basename "$ARCHIVE") (${ARCHIVE_KB} KB)"
echo ""

# Clean up staging .app dir
rm -rf "$APP_DIR"

echo "========================================"
echo "  macOS App Build Complete!"
echo "========================================"
echo ""
echo "Output: macOS/pfodWeb-${VERSION}-macOS.tar.gz"
echo ""
echo "Contents:"
tar -tzf "$ARCHIVE"
echo ""
exit 0
