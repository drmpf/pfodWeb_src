#!/usr/bin/env bash
# build-pfodWeb.sh
# (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
#
# Builds pfodWeb.html from pfodWeb_src and stages it together with
# extraFonts/ into pfodWeb/

set -euo pipefail

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
OUT="$ROOT/pfodWeb"

echo "========================================"
echo "  pfodWeb HTML Builder"
echo "========================================"
echo ""

# ── Check prerequisites ───────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js not found." >&2
    echo "Install from https://nodejs.org/" >&2
    exit 1
fi

# ── Clear the output dir ─────────────────────────────────────────────
rm -rf "$OUT"
mkdir -p "$OUT"

# ── Sync version from pfodWeb_src/version.js into Cargo.toml ─────────
node -e "
var fs=require('fs');
var m=fs.readFileSync('$ROOT/pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);
if(!m){console.log('WARNING: version not found');}
else{
  var v=m[1];
  var c=fs.readFileSync('$ROOT/pfodProxy_rs/Cargo.toml','utf8').replace(/^version = \".*\"/m,'version = \"'+v+'\"');
  fs.writeFileSync('$ROOT/pfodProxy_rs/Cargo.toml',c,'utf8');
  console.log('Synced version '+v+' into Cargo.toml');
}"

# ── Build pfodWeb.html ────────────────────────────────────────────────
echo ""
echo "Building pfodWeb.html ..."
echo ""
(cd "$ROOT/pfodWeb_src" && node build-bundle.js)

# ── Stage pfodWeb.html into pfodWeb/ ─────────────────────────────────
echo ""
echo "Staging artifacts to $OUT/ ..."

cp -f "$ROOT/pfodWeb.html" "$OUT/pfodWeb.html"
echo "  - pfodWeb.html"

# Remove the temp copy left in the repo root by build-bundle.js.
rm -f "$ROOT/pfodWeb.html"

# ── Stage extraFonts/ if present ─────────────────────────────────────
if [ -d "$ROOT/extraFonts" ]; then
    cp -R "$ROOT/extraFonts" "$OUT/extraFonts"
    echo "  - extraFonts/"
    if [ -f "$ROOT/docs/pfodWeb-extraFonts-guide.html" ]; then
        cp -f "$ROOT/docs/pfodWeb-extraFonts-guide.html" "$OUT/extraFonts/pfodWeb-extraFonts-guide.html"
        echo "  - extraFonts/pfodWeb-extraFonts-guide.html"
    fi
fi

echo ""
echo "================================================================"
echo "  pfodWeb build OK.  Artifacts in $OUT/"
echo "================================================================"
exit 0
