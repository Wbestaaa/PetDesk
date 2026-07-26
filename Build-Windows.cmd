@echo off
setlocal
title PetDesk Windows Builder
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto node_missing

call npm.cmd install
if errorlevel 1 goto failed

call npm.cmd run pack:win
if errorlevel 1 goto failed

echo.
echo [PetDesk] Build completed. Opening the dist folder...
start "" "%~dp0dist"
pause
exit /b 0

:node_missing
echo [PetDesk] Node.js was not found.
echo Install Node.js LTS from https://nodejs.org/
pause
exit /b 1

:failed
echo.
echo [PetDesk] Build failed. Please review the error above.
pause
exit /b 1
