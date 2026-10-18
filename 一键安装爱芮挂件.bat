@echo off
chcp 65001 >nul
setlocal
echo.
echo   Airui widget installer
echo   ======================
echo   It will close DSH, install the plugin, then start DSH again.
echo   To preview only, press Ctrl+C and run:
echo     powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-airui.ps1" -DryRun
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-airui.ps1" %*
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (
  echo   Done. Check the bottom-right corner of DSH.
) else (
  echo   Exit code %RC% - send the output above to the assistant.
)
echo.
if not "%AIRUI_NOPAUSE%"=="1" pause
