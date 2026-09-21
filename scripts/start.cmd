@echo off
where node >nul 2>nul
if errorlevel 1 (
  >&2 echo [jev-browser] Node.js was not found in the Agent process PATH.
  >&2 echo Install Node.js 20 or newer from https://nodejs.org/en/download, then restart your Agent application.
  >&2 echo If already installed, add Node to the PATH inherited by the Agent.
  exit /b 127
)
node "%~dp0start.mjs" %*
exit /b %errorlevel%
