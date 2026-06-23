@echo off
REM build_boards.bat - Windows build script for pfodWeb designer board configs
REM Regenerates designer/boards/<Board>/<Board>.json from the per-variant
REM pins_arduino.h + board.json pairs under ..\variants\.
REM (c)2026 Forward Computing and Control Pty. Ltd.

echo ========================================
echo   pfodWeb Board Config Builder (Windows)
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
if not exist build_boards.js (
    echo ERROR: build_boards.js not found
    echo Please ensure you are running this from the pfodWeb_src directory
    echo.
    pause
    exit /b 1
)

echo Generating per-board JSON from ..\variants\...
echo.

REM Run the board config builder
node build_boards.js
set BUILD_ERROR=%errorlevel%

if %BUILD_ERROR% neq 0 (
    echo.
    echo ========================================
    echo   Board Config Build Failed!
    echo ========================================
    echo.
    echo Please check the error messages above
    echo and ensure every variant directory contains
    echo both pins_arduino.h and board.json.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Board Config Build Successful!
echo ========================================
echo.
echo Output: designer\boards\^<Board^>\^<Board^>.json
echo.
echo Next: run build.bat to refresh the bundled pfodWeb.html.
echo.

pause
exit /b 0
