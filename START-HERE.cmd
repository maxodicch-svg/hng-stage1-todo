@echo off
title TaskFlow - local server (keep this window open)
cd /d "%~dp0"

echo ============================================================
echo   TaskFlow - HNG Stage 1
echo ============================================================
echo.
echo   Starting the local server...
echo   KEEP THIS WINDOW OPEN while you use the app.
echo   Press Ctrl+C here (or close the window) to stop it.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] Node.js was not found on your PATH.
  echo       Install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

echo   App:    http://127.0.0.1:4173
echo   Health: http://127.0.0.1:4173/api/health
echo.

start "" http://127.0.0.1:4173
node server.mjs --port 4173

echo.
echo   Server stopped.
pause
