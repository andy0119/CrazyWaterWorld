@echo off
setlocal
cd /d "%~dp0"
py -3.12 --version >nul 2>&1
if not errorlevel 1 (
  py -3.12 install_aurora.py
) else (
  python --version >nul 2>&1
  if errorlevel 1 (
    echo Install Python 3.12 and select "Add Python to PATH", then try again.
    pause
    exit /b 1
  )
  python install_aurora.py
)
if errorlevel 1 (
  echo Installation did not finish. Read the error above.
  pause
  exit /b 1
)
pause
