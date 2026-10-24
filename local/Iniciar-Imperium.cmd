@echo off
setlocal
cd /d "%~dp0.."
set "IMPERIUM_NODE=%CD%\runtime\node.exe"
if not exist "%IMPERIUM_NODE%" set "IMPERIUM_NODE=node"
if not exist "private\config.private.json" (
  "%IMPERIUM_NODE%" local\manage.mjs init
  if errorlevel 1 goto erro
)
"%IMPERIUM_NODE%" local\server.mjs
if errorlevel 1 goto erro
exit /b 0
:erro
echo.
echo A central nao iniciou. Confira a mensagem acima e o guia de instalacao.
pause
exit /b 1
