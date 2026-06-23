@echo off
REM build-linux.bat
REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
REM
REM Build pfodProxy (Linux x86_64) via WSL2 + pfodWeb.html and stage
REM both into linux\  (i.e. pfodWeb\linux\).
REM
REM Requires:
REM   - WSL2 installed  (wsl --install)
REM   - Rust in WSL2    (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh)
REM   - Node.js on Windows (https://nodejs.org/)

cd /d "%~dp0"
set ROOT=%~dp0
set OUT=%ROOT%linux

echo ========================================
echo   pfodProxy Linux Builder (via WSL2)
echo ========================================
echo.

REM ── Clear the output dir first, so its mere existence/contents after this
REM    script exits is itself the signal that the build succeeded -- no
REM    stale files from a previous (possibly failed) run can be mistaken
REM    for fresh output.
if exist "%OUT%" rd /s /q "%OUT%"
mkdir "%OUT%"

REM ── Check WSL is present ─────────────────────────────────────────────
where wsl >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: WSL not found.
    echo Install WSL2:  wsl --install
    echo Then install Rust inside WSL2:
    echo   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs ^| sh
    echo.
    pause
    exit /b 1
)

REM ── Confirm WSL2  (wsl --version only succeeds on WSL2) ──────────────
wsl --version >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: WSL1 detected — WSL2 is required.
    echo Upgrade:  wsl --set-default-version 2
    echo.
    pause
    exit /b 1
)

REM ── Check cargo is available in WSL2 ─────────────────────────────────
wsl -- bash -lc "which cargo" >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Rust/cargo not found in WSL2.
    echo Install inside WSL2:
    echo   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs ^| sh
    echo Then restart WSL and re-run this script.
    echo.
    pause
    exit /b 1
)

REM ── Check system libs in WSL2 (needed by btleplug / tokio-serial) ────
wsl -- bash -lc "pkg-config --exists dbus-1 libudev" >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: one or more required system libraries not found in WSL2.
    echo Install inside WSL2:
    echo   sudo apt install libdbus-1-dev libudev-dev pkg-config
    echo.
    pause
    exit /b 1
)

REM ── Check Node.js (needed to sync version + build pfodWeb) ───────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found — needed to sync version and build pfodWeb.
    echo Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM ── Sync version from pfodWeb_src/version.js into Cargo.toml ─────────
node -e "var fs=require('fs');var m=fs.readFileSync('%ROOT%pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);if(!m){console.log('WARNING: version not found');}else{var v=m[1];var c=fs.readFileSync('%ROOT%pfodProxy_rs/Cargo.toml','utf8').replace(/^version = \".*\"/m,'version = \"'+v+'\"');fs.writeFileSync('%ROOT%pfodProxy_rs/Cargo.toml',c,'utf8');console.log('Synced version '+v+' into Cargo.toml');}"

REM ── Build pfodWeb.html ────────────────────────────────────────────────
echo.
echo Building pfodWeb.html ...
echo.
pushd "%ROOT%pfodWeb_src"
node build-bundle.js
set WEB_CODE=%errorlevel%
popd
if not "%WEB_CODE%"=="0" (
    echo.
    echo ----------------------------------------------------------------
    echo pfodWeb build FAILED with code %WEB_CODE%
    echo ----------------------------------------------------------------
    pause
    exit /b %WEB_CODE%
)

REM ── Build pfodProxy for Linux ─────────────────────────────────────────
REM wslpath is called inside bash to avoid \r contamination from capturing output.
echo.
echo Building pfodProxy for Linux ...
echo.
wsl -- bash -lc "cd $(wslpath -u '%ROOT%')pfodProxy_rs && cargo build --release"
set BUILD_CODE=%errorlevel%
if not "%BUILD_CODE%"=="0" (
    echo.
    echo ----------------------------------------------------------------
    echo Linux build FAILED with code %BUILD_CODE%
    echo ----------------------------------------------------------------
    pause
    exit /b %BUILD_CODE%
)

REM ── Stage into linux\ ─────────────────────────────────────────────────
echo.
echo Staging artifacts to %OUT%\ ...

copy /Y "%ROOT%pfodProxy_rs\target\release\pfodProxy" "%OUT%\pfodProxy" >nul
if errorlevel 1 (
    echo ERROR: could not copy Linux pfodProxy binary.
    pause
    exit /b 1
)
echo   - pfodProxy  (Linux x86_64 binary)

copy /Y "%ROOT%pfodWeb.html" "%OUT%\pfodWeb.html" >nul
if errorlevel 1 (
    echo ERROR: could not copy pfodWeb.html
    pause
    exit /b 1
)
echo   - pfodWeb.html

REM Remove the temp copy left in the repo root by build-bundle.js now that
REM it's been staged into linux\ — only linux\pfodWeb.html is the
REM deliverable for this script.
del /Q "%ROOT%pfodWeb.html" >nul 2>nul

if exist "%ROOT%extraFonts" (
    xcopy /Y /I /E "%ROOT%extraFonts" "%OUT%\extraFonts" >nul
    if errorlevel 1 (
        echo ERROR: could not copy extraFonts\
        pause
        exit /b 1
    )
    echo   - extraFonts\
    if exist "%ROOT%docs\pfodWeb-extraFonts-guide.html" (
        copy /Y "%ROOT%docs\pfodWeb-extraFonts-guide.html" "%OUT%\extraFonts\pfodWeb-extraFonts-guide.html" >nul
        if errorlevel 1 (
            echo ERROR: could not copy pfodWeb-extraFonts-guide.html
            pause
            exit /b 1
        )
        echo   - extraFonts\pfodWeb-extraFonts-guide.html
    )
)

echo.
echo ================================================================
echo   Linux build OK.  Artifacts in %OUT%\
echo ================================================================
pause
exit /b 0
