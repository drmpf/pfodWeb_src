#!/bin/bash
# build.sh - Linux/Mac build script for pfodWeb
# Builds standalone HTML files with inlined JavaScript
# (c)2025 Forward Computing and Control Pty. Ltd.

echo "========================================"
echo "  pfodWeb Builder (Linux/Mac)"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    exit 1
fi

# Check if build script exists
if [ ! -f build-bundle.js ]; then
    echo "ERROR: build-bundle.js not found"
    echo "Please ensure you are running this from the pfodWebServer directory"
    echo ""
    exit 1
fi

echo "Building standalone HTML files..."
echo ""

# Run the bundle builder script
node build-bundle.js
BUNDLE_ERROR=$?

if [ $BUNDLE_ERROR -ne 0 ]; then
    echo ""
    echo "========================================"
    echo "  Standalone Build Failed!"
    echo "========================================"
    echo ""
    echo "Please check the error messages above"
    echo "and ensure all source files exist."
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo "  Build Successful!"
echo "========================================"
echo ""
echo "Output files:"
echo "  - Standalone HTML in: ../ directory"
echo ""
echo "Files created:"
echo "  - ../: pfodWeb.html (complete standalone) and index.html (stub redirect)"
echo ""

# ── Stage pfodProxy artifacts alongside pfodWeb.html ─────────────────
# Each file is optional — pfodWeb itself works without pfodProxy.
# Missing files are warned about, not treated as fatal.  Run
# ../pfodProxy_rs/build-pfodProxy.sh first to refresh pfodProxy.
echo "Staging pfodProxy artifacts into ../"
if [ -f "../pfodProxy_rs/pfodProxy" ]; then
    if cp -f "../pfodProxy_rs/pfodProxy" "../pfodProxy"; then
        chmod +x "../pfodProxy"
        echo "  - pfodProxy"
    else
        echo "  ! WARNING: copy of pfodProxy failed.  Is it currently running?"
    fi
else
    echo "  ! NOTE: ../pfodProxy_rs/pfodProxy not found."
    echo "         Run ../pfodProxy_rs/build-pfodProxy.sh to build it."
fi
if [ -f "../pfodProxy_rs/pfodProxy.exe" ]; then
    if cp -f "../pfodProxy_rs/pfodProxy.exe" "../pfodProxy.exe"; then
        echo "  - pfodProxy.exe (Windows binary)"
    fi
fi
if [ -f "../pfodProxy_rs/run-pfodProxy.bat" ]; then
    if cp -f "../pfodProxy_rs/run-pfodProxy.bat" "../run-pfodProxy.bat"; then
        echo "  - run-pfodProxy.bat"
    fi
fi
if [ -f "../pfodProxy_rs/run-pfodProxy.sh" ]; then
    if cp -f "../pfodProxy_rs/run-pfodProxy.sh" "../run-pfodProxy.sh"; then
        chmod +x "../run-pfodProxy.sh"
        echo "  - run-pfodProxy.sh"
    fi
fi
echo ""

echo "Usage:"
echo "  1. Open ../pfodWeb.html (or ../index.html, which redirects) in browser"
echo ""
echo "To create gzipped bundles for server deployment:"
echo "  - Run: bash ../build_data.sh (Linux/Mac)"
echo "  - Run: ..\\build_data.bat (Windows)"
echo ""

if [ -f build_warnings.txt ]; then
    echo "========================================"
    echo "  Build Warnings:"
    echo "========================================"
    cat build_warnings.txt
    echo ""
fi

exit 0
