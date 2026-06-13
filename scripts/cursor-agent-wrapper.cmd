@echo off
setlocal
set "AGENT_VERSION=2026.06.12-19-59-36-f6aba9a"
set "AGENT_ROOT=%LOCALAPPDATA%\cursor-agent\versions\%AGENT_VERSION%"
if not exist "%AGENT_ROOT%\node.exe" (
  echo cursor-agent-wrapper: missing %AGENT_ROOT%\node.exe 1>&2
  exit /b 1
)
"%AGENT_ROOT%\node.exe" "%AGENT_ROOT%\index.js" %*
