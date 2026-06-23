@echo off
REM build.bat - Windows build script for pfodWeb
REM Builds standalone HTML files with inlined JavaScript
REM (c)2025 Forward Computing and Control Pty. Ltd.

echo ========================================
echo   pfodWeb Builder (Windows)
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if build script exists
if not exist build-bundle.js (
    echo ERROR: build-bundle.js not found
    echo Please ensure you are running this from the pfodWebServer directory
    echo.
    pause
    exit /b 1
)

echo Building standalone HTML files...
echo.

REM Run the bundle builder script
node build-bundle.js
set BUNDLE_ERROR=%errorlevel%

if %BUNDLE_ERROR% neq 0 (
    echo.
    echo ========================================
    echo   Standalone Build Failed!
    echo ========================================
    echo.
    echo Please check the error messages above
    echo and ensure all source files exist.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Successful!
echo ========================================
echo.
echo Output files:
echo   - Standalone HTML in: ..\ directory
echo.
echo Files created:
echo   - ..\: pfodWeb.html (complete standalone) and index.html (stub redirect)
echo.

REM ── Stage pfodProxy artifacts alongside pfodWeb.html ──────────────────
REM Each file is optional — pfodWeb itself works without pfodProxy.
REM Missing files are warned about, not treated as fatal.  Run
REM ..\pfodProxy_rs\build-pfodProxy.bat first to refresh pfodProxy.exe.
echo Staging pfodProxy artifacts into ..\
if exist "..\pfodProxy_rs\pfodProxy.exe" (
    copy /Y "..\pfodProxy_rs\pfodProxy.exe" "..\pfodProxy.exe" >nul
    if "%errorlevel%"=="0" (
        echo   - pfodProxy.exe
    ) else (
        echo   ! WARNING: copy of pfodProxy.exe failed.  Is it currently running?
    )
) else (
    echo   ! NOTE: ..\pfodProxy_rs\pfodProxy.exe not found.
    echo          Run ..\pfodProxy_rs\build-pfodProxy.bat to build it.
)
if exist "..\pfodProxy_rs\pfodProxy" (
    copy /Y "..\pfodProxy_rs\pfodProxy" "..\pfodProxy" >nul
    if "%errorlevel%"=="0" echo   - pfodProxy ^(Linux/Mac binary^)
)
if exist "..\pfodProxy_rs\run-pfodProxy.bat" (
    copy /Y "..\pfodProxy_rs\run-pfodProxy.bat" "..\run-pfodProxy.bat" >nul
    if "%errorlevel%"=="0" echo   - run-pfodProxy.bat
)
if exist "..\pfodProxy_rs\run-pfodProxy.sh" (
    copy /Y "..\pfodProxy_rs\run-pfodProxy.sh" "..\run-pfodProxy.sh" >nul
    if "%errorlevel%"=="0" echo   - run-pfodProxy.sh
)
echo.

echo Usage:
echo   1. Open ..\pfodWeb.html (or ..\index.html, which redirects) in browser
echo.
echo To create gzipped bundles for server deployment:
echo   - Run: ..\build_data.bat (Windows)
echo   - Run: bash ../build_data.sh (Linux/Mac)
echo.

if exist build_warnings.txt (
    echo ========================================
    echo   Build Warnings:
    echo ========================================
    type build_warnings.txt
    echo.
)

pause
exit /b 0
