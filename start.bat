@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set NODE_VER=v20.18.0
set PLAT=win
set ARCH=x64
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ARCH=arm64

where node >nul 2>nul
if %errorlevel%==0 (
  for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
  if !NODE_MAJOR! GEQ 18 ( set "NODE=node" & goto :run )
)
if exist ".runtime\node-win-%ARCH%\node.exe" ( set "NODE=.runtime\node-win-%ARCH%\node.exe" & goto :run )

echo [monke] Node.js ^>=18 not found - fetching portable Node (win-%ARCH%) onto the drive...
if not exist ".runtime" mkdir ".runtime"
set "PKG=node-%NODE_VER%-win-%ARCH%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $u='https://nodejs.org/dist/%NODE_VER%/%PKG%.zip'; Invoke-WebRequest $u -OutFile .runtime\node.zip; Expand-Archive -Force .runtime\node.zip .runtime; if (Test-Path '.runtime\node-win-%ARCH%') { Remove-Item -Recurse -Force '.runtime\node-win-%ARCH%' }; Rename-Item '.runtime\%PKG%' 'node-win-%ARCH%'; Remove-Item .runtime\node.zip"
set "NODE=.runtime\node-win-%ARCH%\node.exe"

:run
echo [monke] using node: %NODE%
"%NODE%" "bootstrap\bootstrap.mjs" %*
endlocal
