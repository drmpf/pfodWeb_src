@echo off
REM build-pfodWeb.bat
REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
REM
REM Builds pfodWeb.html from pfodWeb_src and stages it together with
REM extraFonts/ into pfodWeb\

cd /d "%~dp0"
set ROOT=%~dp0
set OUT=%ROOT%pfodWeb

echo ========================================
echo   pfodWeb HTML Builder
echo ========================================
echo.

REM ── Check prerequisites ───────────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found.
    echo Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM ── Clear the output dir ─────────────────────────────────────────────
if exist "%OUT%" rd /s /q "%OUT%"
mkdir "%OUT%"

REM ── Sync version from pfodWeb_src/version.js into Cargo.toml ─────────
node -e "var fs=require('fs');var m=fs.readFileSync('pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);if(!m){console.log('WARNING: version not found');}else{var v=m[1];var c=fs.readFileSync('pfodProxy_rs/Cargo.toml','utf8').replace(/^version = \".*\"/m,'version = \"'+v+'\"');fs.writeFileSync('pfodProxy_rs/Cargo.toml',c,'utf8');console.log('Synced version '+v+' into Cargo.toml');}"

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

REM ── Stage pfodWeb.html into pfodWeb\ ─────────────────────────────────
echo.
echo Staging artifacts to %OUT%\ ...

copy /Y "%ROOT%pfodWeb.html" "%OUT%\pfodWeb.html" >nul
if errorlevel 1 (
    echo ERROR: could not copy pfodWeb.html
    pause
    exit /b 1
)
echo   - pfodWeb.html

REM Remove the temp copy left in the repo root by build-bundle.js.
del /Q "%ROOT%pfodWeb.html" >nul 2>nul

REM ── Stage extraFonts\ if present ─────────────────────────────────────
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
echo   pfodWeb build OK.  Artifacts in %OUT%\
echo ================================================================
pause
exit /b 0
