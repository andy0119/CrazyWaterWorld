@echo off
setlocal
cd /d "%~dp0"
set "AURORA_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "PYTHONPATH=C:\Users\a2220\Documents\Codex\2026-10-16\files-mentioned-by-the-user-aurora\work\backend-runtime;%PYTHONPATH%"
if exist "%AURORA_PY%" (
  "%AURORA_PY%" launch.py
) else (
  py launch.py
)
if errorlevel 1 pause
