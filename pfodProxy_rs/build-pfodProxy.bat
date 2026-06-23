@echo off
REM build-pfodProxy.bat
REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
REM
REM Build the pfodProxy release binary and stage it next to this script
REM so run-pfodProxy.bat picks it up as the "distribution" copy.  Forwards
REM extra args to cargo (e.g.  build-pfodProxy.bat --verbose).

cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Sync version from pfodWeb_src/version.js into Cargo.toml before building.
node -e "var fs=require('fs');var m=fs.readFileSync('../pfodWeb_src/version.js','utf8').match(/V(\d+\.\d+\.\d+)/);if(!m){console.log('WARNING: version not found');}else{var v=m[1];var c=fs.readFileSync('Cargo.toml','utf8').replace(/^version = \".*\"/m,'version = \"'+v+'\"');fs.writeFileSync('Cargo.toml',c,'utf8');console.log('Synced version '+v+' into Cargo.toml');}"

echo Building pfodProxy (release) ...
echo.
cargo build --release %*
set BUILD_CODE=%errorlevel%
if not "%BUILD_CODE%"=="0" (
    echo.
    echo ----------------------------------------------------------------
    echo Build FAILED with code %BUILD_CODE%
    echo ----------------------------------------------------------------
    pause
    exit /b %BUILD_CODE%
)

echo.
echo Copying target\release\pfodProxy.exe -^> pfodProxy.exe ...
copy /Y "target\release\pfodProxy.exe" "pfodProxy.exe" >nul
if not "%errorlevel%"=="0" (
    echo.
    echo Copy FAILED.  Is pfodProxy.exe currently running?  Stop it and re-run.
    echo.
    pause
    exit /b 1
)

echo.
echo Copying target\release\pfodProxy.exe -^> ..\pfodProxy.exe ...
copy /Y "target\release\pfodProxy.exe" "..\pfodProxy.exe" >nul
if not "%errorlevel%"=="0" (
    echo.
    echo Copy to ..\pfodProxy.exe FAILED.  Is pfodProxy.exe currently running?  Stop it and re-run.
    echo.
    pause
    exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo Build OK.  pfodProxy.exe is ready.
echo Run with:  run-pfodProxy.bat   [port]
echo ----------------------------------------------------------------
pause
exit /b 0
