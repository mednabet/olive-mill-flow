# ============================================================
# 99-uninstall.ps1 - Supprime le site IIS et la base
# ============================================================
[CmdletBinding()]
param(
    [string]$SiteName = "OliveApp",
    [string]$InstallRoot = "C:\inetpub\oliveapp",
    [string]$DbName = "oliveapp",
    [string]$DbUser = "oliveapp_user"
)

$ErrorActionPreference = "Continue"
Import-Module WebAdministration -ErrorAction SilentlyContinue

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

Write-Host "`n=== Desinstallation OliveApp ===" -ForegroundColor Cyan

if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Sub "Suppression du site IIS..."
    Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
    Remove-Website -Name $SiteName
}

if (Test-Path "IIS:\AppPools\$SiteName-Pool") {
    Write-Sub "Suppression de l'AppPool..."
    Remove-WebAppPool -Name "$SiteName-Pool"
}

if (Test-Path $InstallRoot) {
    Write-Sub "Suppression du repertoire $InstallRoot..."
    Remove-Item -Recurse -Force $InstallRoot -ErrorAction SilentlyContinue
}

$confirm = Read-Host "Supprimer aussi la base PostgreSQL '$DbName' et l'utilisateur '$DbUser' ? (o/N)"
if ($confirm -eq "o" -or $confirm -eq "O") {
    $pwd = Read-Host -AsSecureString "Mot de passe 'postgres'"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    & $psql -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS `"$DbName`";"
    & $psql -h localhost -U postgres -d postgres -c "DROP ROLE IF EXISTS $DbUser;"
    $env:PGPASSWORD = $null
    Write-Sub "Base et utilisateur supprimes"
}

Write-Host "`nDesinstallation terminee." -ForegroundColor Green
