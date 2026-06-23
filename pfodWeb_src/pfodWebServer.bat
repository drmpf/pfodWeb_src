@echo off
REM pfodWebServer.bat — start the local test server that serves the gzipped
REM build_data output from ../data/ on http://localhost:8080.
REM
REM Use this to validate the bundles (and ESP32-style gzip+Content-Encoding
REM serving) without flashing firmware.  Stop the server with Ctrl+C.

setlocal

REM Run from the directory this script lives in so paths resolve correctly
cd /d "%~dp0"

REM --- Verify Node is available ---------------------------------------------
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: node not found in PATH.
    echo Install Node.js from https://nodejs.org and reopen this window.
    pause
    exit /b 1
)

REM --- Verify express is installed (one-off) --------------------------------
if not exist "node_modules\express" (
    echo Installing express ^(one-off^)...
    npm install express
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

REM --- Verify the data/ directory has been built ----------------------------
if not exist "..\data\pfodWeb.html.gz" (
    echo WARNING: ..\data\pfodWeb.html.gz not found.
    echo Run ..\build_data.bat first to generate the gzipped bundles.
    echo.
)

echo Starting pfodWebServer on http://localhost:8080
echo Press Ctrl+C to stop.
echo.

node pfodWebServer.js
set "NODE_EXIT=%errorlevel%"

echo.
echo --------------------------------------------------------------------
if "%NODE_EXIT%"=="0" (
    echo Server exited cleanly ^(exit code 0^).
) else (
    echo Server exited with error code %NODE_EXIT%.
    echo Common causes:
    echo   * Port 8080 already in use - try: set PORT=8081 ^&^& pfodWebServer.bat
    echo   * express not installed correctly - delete node_modules and rerun.
)
echo --------------------------------------------------------------------
pause

endlocal
