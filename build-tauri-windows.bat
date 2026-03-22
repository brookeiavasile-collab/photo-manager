@echo off
setlocal

cd /d "%~dp0"
if errorlevel 1 (
  echo Failed to enter project directory.
  exit /b 1
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo PowerShell not found.
  exit /b 1
)

powershell -ExecutionPolicy Bypass -File ".\build-tauri-windows.ps1" -Bundle nsis
exit /b %ERRORLEVEL%
