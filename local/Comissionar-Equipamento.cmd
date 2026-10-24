@echo off
setlocal
cd /d "%~dp0.."
set "IMPERIUM_NODE=%CD%\runtime\node.exe"
if not exist "%IMPERIUM_NODE%" set "IMPERIUM_NODE=node"
"%IMPERIUM_NODE%" local\commission-device.mjs
pause
