@echo off
REM build-pfodProxy.bat
REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
REM
REM Build the pfodProxy release binary and stage it next to this script
REM so run-pfodProxy.bat picks it up as the "distribution" copy.  Forwards
REM extra args to cargo (e.g.  build-pfodProxy.bat --verbose).

cd /d "%~dp0"

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
