@echo off
setlocal
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0install-olive-local-windows.ps1" %*
