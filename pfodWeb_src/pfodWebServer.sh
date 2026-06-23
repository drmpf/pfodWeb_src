#!/bin/bash
# pfodWebServer.sh — start the local test server that serves the gzipped
# build_data output from ../data/ on http://localhost:8080.
#
# Use this to validate the bundles (and ESP32-style gzip+Content-Encoding
# serving) without flashing firmware.  Stop the server with Ctrl+C.

# Run from the directory this script lives in so paths resolve correctly
cd "$(dirname "$0")" || exit 1

# --- Verify Node is available ----------------------------------------------
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node not found in PATH."
    echo "Install Node.js from https://nodejs.org and reopen this terminal."
    exit 1
fi

# --- Verify express is installed (one-off) ---------------------------------
if [ ! -d "node_modules/express" ]; then
    echo "Installing express (one-off)..."
    if ! npm install express; then
        echo "ERROR: npm install failed."
        exit 1
    fi
fi

# --- Verify the data/ directory has been built -----------------------------
if [ ! -f "../data/pfodWeb.html.gz" ]; then
    echo "WARNING: ../data/pfodWeb.html.gz not found."
    echo "Run ../build_data.sh first to generate the gzipped bundles."
    echo ""
fi

echo "Starting pfodWebServer on http://localhost:8080"
echo "Press Ctrl+C to stop."
echo ""

node pfodWebServer.js
NODE_EXIT=$?

echo ""
echo "--------------------------------------------------------------------"
if [ "$NODE_EXIT" = "0" ]; then
    echo "Server exited cleanly (exit code 0)."
else
    echo "Server exited with error code $NODE_EXIT."
    echo "Common causes:"
    echo "  * Port 8080 already in use - try: PORT=8081 ./pfodWebServer.sh"
    echo "  * express not installed correctly - delete node_modules and rerun."
fi
echo "--------------------------------------------------------------------"

# Keep the terminal open if launched without a TTY (e.g. double-clicked from
# a file manager).  Skipped when run from an interactive shell.
if [ ! -t 0 ]; then
    read -r -p "Press Enter to close this window..."
fi
