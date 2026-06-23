#!/usr/bin/env bash
# build-pfodProxy.sh
# (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
#
# Build the pfodProxy release binary and stage it next to this script
# so run-pfodProxy.sh picks it up as the "distribution" copy.  Forwards
# extra args to cargo (e.g.  ./build-pfodProxy.sh --verbose).
#
# First-time setup — run this once to mark the script executable:
#     chmod +x build-pfodProxy.sh
# Then invoke from a terminal as:
#     ./build-pfodProxy.sh
# (Or run via bash without chmod:  bash build-pfodProxy.sh )

cd "$(dirname "$0")" || exit 1

pause_before_exit() {
    if [ -t 0 ]; then
        printf '\nPress Enter to close this window... '
        read _dummy
    fi
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    pause_before_exit
    exit 1
fi

# Sync version from pfodWeb_src/version.js into Cargo.toml before building.
node -e "var fs=require('fs');var m=fs.readFileSync('../pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);if(!m){console.log('WARNING: version not found');}else{var v=m[1];var c=fs.readFileSync('Cargo.toml','utf8').replace(/^version = \".*\"/m,'version = \"'+v+'\"');fs.writeFileSync('Cargo.toml',c,'utf8');console.log('Synced version '+v+' into Cargo.toml');}"

# Ensure both macOS targets are available (idempotent).
rustup target add x86_64-apple-darwin aarch64-apple-darwin

echo "Building pfodProxy (release, x86_64) ..."
echo
if ! cargo build --release --target x86_64-apple-darwin "$@"; then
    echo
    echo "----------------------------------------------------------------"
    echo "Build FAILED (x86_64)"
    echo "----------------------------------------------------------------"
    pause_before_exit
    exit 1
fi

echo
echo "Building pfodProxy (release, arm64) ..."
echo
if ! cargo build --release --target aarch64-apple-darwin "$@"; then
    echo
    echo "----------------------------------------------------------------"
    echo "Build FAILED (arm64)"
    echo "----------------------------------------------------------------"
    pause_before_exit
    exit 1
fi

echo
# On macOS, cp -f succeeds even when the binary is running (the OS keeps
# the old inode alive), so the copy error branch never fires.  Check for
# a running pfodProxy process explicitly before attempting either copy.
if pgrep -x pfodProxy > /dev/null 2>&1; then
    echo "----------------------------------------------------------------"
    echo "Copy FAILED.  pfodProxy is currently running.  Stop it first,"
    echo "then re-run this script."
    echo "----------------------------------------------------------------"
    pause_before_exit
    exit 1
fi

echo "Creating Universal Binary (lipo) -> pfodProxy ..."
if ! lipo -create -output pfodProxy \
        target/x86_64-apple-darwin/release/pfodProxy \
        target/aarch64-apple-darwin/release/pfodProxy; then
    echo
    echo "lipo FAILED."
    echo
    pause_before_exit
    exit 1
fi
chmod +x pfodProxy

echo
echo "Copying pfodProxy -> ../pfodProxy ..."
if ! cp -f pfodProxy ../pfodProxy; then
    echo
    echo "Copy to ../pfodProxy FAILED.  Is pfodProxy currently running?  Stop it and re-run."
    echo
    pause_before_exit
    exit 1
fi
chmod +x ../pfodProxy

echo
echo "----------------------------------------------------------------"
echo "Build OK.  pfodProxy is ready."
echo "Run with:  ./run-pfodProxy.sh   [port]"
echo "----------------------------------------------------------------"
pause_before_exit
exit 0
