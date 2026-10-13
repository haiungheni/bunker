@echo off
title Bunker Companion Platform - Server
chcp 65001 >nul
cls
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nu este instalat. Instaleaza Node.js 22 sau mai nou.
  pause
  exit /b 1
)
if not exist "node_modules\express" (
  echo Instalare dependente...
  call npm install
  if errorlevel 1 exit /b 1
)

echo ========================================================
echo        BUNKER - PLATFORMA PENTRU JOCUL FIZIC
echo ========================================================
echo.
echo Pornire server Node.js...
echo.

node server.js --open

pause
