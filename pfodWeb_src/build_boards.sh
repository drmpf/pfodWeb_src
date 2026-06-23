#!/bin/bash
# build_boards.sh - Linux/Mac build script for pfodWeb designer board configs
# Regenerates designer/boards/<Board>/<Board>.json from the per-variant
# pins_arduino.h + board.json pairs under ../variants/.
# (c)2026 Forward Computing and Control Pty. Ltd.

echo "========================================"
echo "  pfodWeb Board Config Builder (Linux/Mac)"
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
if [ ! -f build_boards.js ]; then
    echo "ERROR: build_boards.js not found"
    echo "Please ensure you are running this from the pfodWeb_src directory"
    echo ""
    exit 1
fi

echo "Generating per-board JSON from ../variants/..."
echo ""

# Run the board config builder
node build_boards.js
BUILD_ERROR=$?

if [ $BUILD_ERROR -ne 0 ]; then
    echo ""
    echo "========================================"
    echo "  Board Config Build Failed!"
    echo "========================================"
    echo ""
    echo "Please check the error messages above"
    echo "and ensure every variant directory contains"
    echo "both pins_arduino.h and board.json."
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo "  Board Config Build Successful!"
echo "========================================"
echo ""
echo "Output: designer/boards/<Board>/<Board>.json"
echo ""
echo "Next: run bash build.sh to refresh the bundled pfodWeb.html."
echo ""

exit 0
