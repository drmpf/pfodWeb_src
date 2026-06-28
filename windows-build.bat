@echo off
REM windows-build.bat
REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
REM
REM Builds pfodProxy.exe and stages it into windows\
REM Run build-pfodWeb.bat separately to build pfodWeb.html.

cd /d "%~dp0"
set ROOT=%~dp0
set OUT=%ROOT%windows

echo ========================================
echo   pfodProxy Windows Builder
echo ========================================
echo.

REM ── Clear the output dir first, so its mere existence/contents after this
REM    script exits is itself the signal that the build succeeded -- no
REM    stale files from a previous (possibly failed) run can be mistaken
REM    for fresh output. Must check for a running pfodProxy.exe first since
REM    its locked .exe file would otherwise make the delete fail.
tasklist /FI "IMAGENAME eq pfodProxy.exe" 2>nul | find /I "pfodProxy.exe" >nul
if not errorlevel 1 (
    echo.
    echo ERROR: pfodProxy.exe is currently running — stop it and re-run this script.
    echo.
    pause
    exit /b 1
)
if exist "%OUT%" rd /s /q "%OUT%"
mkdir "%OUT%"

REM ── Check prerequisites ───────────────────────────────────────────────
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Rust/cargo not found.
    echo Install from https://rustup.rs/
    echo.
    pause
    exit /b 1
)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found.
    echo Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM ── Sync version from pfodWeb_src/version.js into Cargo.toml ─────────
node -e "var fs=require('fs');var m=fs.readFileSync('pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);if(!m){console.log('WARNING: version not found');}else{var v=m[1];var c=fs.readFileSync('pfodProxy_rs/Cargo.toml','utf8').replace(/^version = \".*\"/m,'version = \"'+v+'\"');fs.writeFileSync('pfodProxy_rs/Cargo.toml',c,'utf8');console.log('Synced version '+v+' into Cargo.toml');}"

REM ── Build pfodProxy.exe ───────────────────────────────────────────────
echo.
echo Building pfodProxy.exe ...
echo.
pushd "%ROOT%pfodProxy_rs"
cargo build --release
set BUILD_CODE=%errorlevel%
popd
if not "%BUILD_CODE%"=="0" (
    echo.
    echo ----------------------------------------------------------------
    echo Windows build FAILED with code %BUILD_CODE%
    echo ----------------------------------------------------------------
    pause
    exit /b %BUILD_CODE%
)

REM ── Stage into windows\ ───────────────────────────────────────────────
echo.
echo Staging artifacts to %OUT%\ ...

copy /Y "%ROOT%pfodProxy_rs\target\release\pfodProxy.exe" "%OUT%\pfodProxy.exe" >nul
if errorlevel 1 (
    echo ERROR: could not copy pfodProxy.exe
    pause
    exit /b 1
)
echo   - pfodProxy.exe

REM ── Generate create-desktop-shortcut.bat directly into %OUT%\ -- this is
REM    the same script as the project-root create-desktop-shortcut.bat,
REM    written out line-by-line instead of copied, so the output dir is
REM    self-contained. ^ escapes carets/parens/redirects and %% escapes
REM    percents so the literal source text (not this script's own
REM    expansion of it) ends up in the generated file.
set "SHORTCUT_BAT=%OUT%\create-desktop-shortcut.bat"
echo @echo off>"%SHORTCUT_BAT%"
echo REM create-desktop-shortcut.bat>>"%SHORTCUT_BAT%"
echo REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.>>"%SHORTCUT_BAT%"
echo REM>>"%SHORTCUT_BAT%"
echo REM Creates a "pfodProxy" shortcut on the Desktop that points at>>"%SHORTCUT_BAT%"
echo REM pfodProxy.exe in this folder, so pfodProxy can be started without>>"%SHORTCUT_BAT%"
echo REM navigating back to wherever this folder was extracted. Safe to run>>"%SHORTCUT_BAT%"
echo REM more than once — it just overwrites the same shortcut each time.>>"%SHORTCUT_BAT%"
echo.>>"%SHORTCUT_BAT%"
echo cd /d "%%~dp0">>"%SHORTCUT_BAT%"
echo.>>"%SHORTCUT_BAT%"
echo if not exist "pfodProxy.exe" ^(>>"%SHORTCUT_BAT%"
echo echo ERROR: pfodProxy.exe not found in this folder.>>"%SHORTCUT_BAT%"
echo echo Run this script from the folder containing pfodProxy.exe.>>"%SHORTCUT_BAT%"
echo echo.>>"%SHORTCUT_BAT%"
echo pause>>"%SHORTCUT_BAT%"
echo exit /b 1 >>"%SHORTCUT_BAT%"
echo ^)>>"%SHORTCUT_BAT%"
echo.>>"%SHORTCUT_BAT%"
echo set "PS1=%%TEMP%%\pfod_create_shortcut.ps1">>"%SHORTCUT_BAT%"
echo ^(>>"%SHORTCUT_BAT%"
echo echo $ws = New-Object -ComObject WScript.Shell>>"%SHORTCUT_BAT%"
echo echo $shortcut = $ws.CreateShortcut^^^("$env:USERPROFILE\Desktop\pfodProxy.lnk"^^^)>>"%SHORTCUT_BAT%"
echo echo $shortcut.TargetPath = "%%~dp0pfodProxy.exe">>"%SHORTCUT_BAT%"
echo echo $shortcut.WorkingDirectory = "%%~dp0">>"%SHORTCUT_BAT%"
echo echo $shortcut.IconLocation = "%%~dp0pfodProxy.exe">>"%SHORTCUT_BAT%"
echo echo $shortcut.Save^^^(^^^)>>"%SHORTCUT_BAT%"
echo ^) ^> "%%PS1%%">>"%SHORTCUT_BAT%"
echo.>>"%SHORTCUT_BAT%"
echo powershell -NoProfile -ExecutionPolicy Bypass -File "%%PS1%%">>"%SHORTCUT_BAT%"
echo del "%%PS1%%" ^>nul 2^>nul>>"%SHORTCUT_BAT%"
echo.>>"%SHORTCUT_BAT%"
echo echo.>>"%SHORTCUT_BAT%"
echo echo Created a "pfodProxy" shortcut on your Desktop.>>"%SHORTCUT_BAT%"
echo echo Double-click it any time to start pfodProxy.>>"%SHORTCUT_BAT%"
echo echo.>>"%SHORTCUT_BAT%"
echo pause>>"%SHORTCUT_BAT%"
echo   - create-desktop-shortcut.bat

echo.
echo ================================================================
echo   Windows build OK.  Artifacts in %OUT%\
echo ================================================================
pause
exit /b 0
