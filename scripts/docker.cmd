@echo off
rem Virtual Utopia docker command wrapper.
rem Docker Desktop is installed per-user (CLI not on system PATH); use this entry.
rem Usage: scripts\docker.cmd ps  |  scripts\docker.cmd compose -f deploy/docker-compose.yml up -d
rem If Docker Desktop moves, update DOCKER_EXE below.
set "DOCKER_EXE=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe"
if not exist "%DOCKER_EXE%" (
  echo [docker.cmd] Docker CLI not found: %DOCKER_EXE%
  exit /b 1
)
"%DOCKER_EXE%" %*
exit /b %ERRORLEVEL%
