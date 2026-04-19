@echo off
REM ============================================================
REM Lanceur du script d'installation - relance en admin si besoin
REM ============================================================
setlocal

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo Privileges administrateur requis. Relance en cours...
    echo.
    powershell -Command "Start-Process cmd -ArgumentList '/c','\"%~f0\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ============================================================
echo   Installation OliveApp - IIS + PostgreSQL
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% EQU 0 (
    echo Installation terminee avec succes.
) else (
    echo Installation echouee avec le code %EXITCODE%. Voir les logs dans deploy\logs\
)
echo.
pause
exit /b %EXITCODE%
