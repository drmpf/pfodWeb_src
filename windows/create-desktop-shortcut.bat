@echo off
REM create-desktop-shortcut.bat
REM (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
REM
REM Creates a "pfodProxy" shortcut on the Desktop that points at
REM pfodProxy.exe in this folder, so pfodProxy can be started without
REM navigating back to wherever this folder was extracted. Safe to run
REM more than once — it just overwrites the same shortcut each time.

cd /d "%~dp0"

if not exist "pfodProxy.exe" (
echo ERROR: pfodProxy.exe not found in this folder.
echo Run this script from the folder containing pfodProxy.exe.
echo.
pause
exit /b 1 
)

set "PS1=%TEMP%\pfod_create_shortcut.ps1"
(
echo $ws = New-Object -ComObject WScript.Shell
echo $shortcut = $ws.CreateShortcut^("$env:USERPROFILE\Desktop\pfodProxy.lnk"^)
echo $shortcut.TargetPath = "%~dp0pfodProxy.exe"
echo $shortcut.WorkingDirectory = "%~dp0"
echo $shortcut.IconLocation = "%~dp0pfodProxy.exe"
echo $shortcut.Save^(^)
) > "%PS1%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
del "%PS1%" >nul 2>nul

echo.
echo Created a "pfodProxy" shortcut on your Desktop.
echo Double-click it any time to start pfodProxy.
echo.
pause
