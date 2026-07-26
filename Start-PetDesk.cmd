@echo off
setlocal
title PetDesk
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto node_missing

if not exist "node_modules\electron\package.json" (
  echo [PetDesk] Installing runtime components. This may take a few minutes...
  call npm.cmd install
  if errorlevel 1 goto failed
)

echo [PetDesk] Starting...
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0

:node_missing
echo [PetDesk] Node.js was not found.
echo Install Node.js LTS from https://nodejs.org/
pause
exit /b 1

:failed
echo.
echo [PetDesk] Startup failed. Please keep this window and copy the error above.
pause
exit /b 1
