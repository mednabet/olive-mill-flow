# ============================================================
# 05-iis-site.ps1 - Cree AppPool, Site IIS, deploie les fichiers
# ============================================================
[CmdletBinding()]
param(
    [string]$SiteName = "OliveApp",
    [int]$HttpPort = 8080,
    [string]$InstallRoot = "C:\inetpub\oliveapp",
    [Parameter(Mandatory=$true)][string]$ProjectRoot
)

$ErrorActionPreference = "Stop"
Import-Module WebAdministration -ErrorAction Stop

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

# --- Locate built files ---
$buildDir = $env:OLIVEAPP_BUILD_DIR
if (-not $buildDir -or -not (Test-Path $buildDir)) {
    $candidates = @(
        (Join-Path $ProjectRoot ".output\public"),
        (Join-Path $ProjectRoot "dist"),
        (Join-Path $ProjectRoot "build\client")
    )
    $buildDir = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $buildDir) {
    Write-Host "    [ERR] Build introuvable. Lancez 04-build.ps1 d'abord." -ForegroundColor Red
    exit 1
}
Write-Sub "Source : $buildDir"

# --- Prepare install root ---
if (-not (Test-Path $InstallRoot)) {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
}

# Stop site if exists (to release file locks)
if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Sub "Arret du site existant..."
    Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
}

# --- Copy files ---
Write-Sub "Copie des fichiers vers $InstallRoot..."
robocopy $buildDir $InstallRoot /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
# Robocopy exit codes 0-7 are success
if ($LASTEXITCODE -ge 8) {
    Write-Host "    [ERR] Echec copie (robocopy code $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

# --- Install web.config ---
$webConfigSrc = Join-Path $PSScriptRoot "..\config\web.config"
$webConfigDst = Join-Path $InstallRoot "web.config"
if (Test-Path $webConfigSrc) {
    Copy-Item $webConfigSrc $webConfigDst -Force
    Write-Sub "web.config installe"
} else {
    Write-Host "    [ERR] web.config template introuvable : $webConfigSrc" -ForegroundColor Red
    exit 1
}

# --- Permissions: grant IIS_IUSRS read access ---
Write-Sub "Attribution des permissions IIS_IUSRS..."
$acl = Get-Acl $InstallRoot
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "IIS_IUSRS", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow"
)
$acl.SetAccessRule($rule)
Set-Acl $InstallRoot $acl

# --- AppPool ---
$appPoolName = "$SiteName-Pool"
if (Test-Path "IIS:\AppPools\$appPoolName") {
    Write-Sub "AppPool '$appPoolName' existe, redemarrage..."
    Restart-WebAppPool -Name $appPoolName -ErrorAction SilentlyContinue
} else {
    Write-Sub "Creation AppPool '$appPoolName'..."
    New-WebAppPool -Name $appPoolName | Out-Null
    Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name "managedRuntimeVersion" -Value ""
    Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name "enable32BitAppOnWin64" -Value $false
    Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name "processModel.identityType" -Value "ApplicationPoolIdentity"
}

# --- Site ---
if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Sub "Mise a jour du site '$SiteName'..."
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name "physicalPath" -Value $InstallRoot
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name "applicationPool" -Value $appPoolName
    # Update binding
    $existing = Get-WebBinding -Name $SiteName -ErrorAction SilentlyContinue
    if ($existing) { Remove-WebBinding -Name $SiteName -ErrorAction SilentlyContinue }
    New-WebBinding -Name $SiteName -Protocol "http" -Port $HttpPort -IPAddress "*" | Out-Null
} else {
    Write-Sub "Creation du site '$SiteName' sur le port $HttpPort..."
    New-Website -Name $SiteName -PhysicalPath $InstallRoot -ApplicationPool $appPoolName -Port $HttpPort -Force | Out-Null
}

# --- Firewall rule ---
$ruleName = "OliveApp-HTTP-$HttpPort"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Sub "Ajout regle pare-feu pour le port $HttpPort..."
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound -Protocol TCP -LocalPort $HttpPort `
        -Action Allow -Profile Any | Out-Null
}

# --- Start site ---
Start-Website -Name $SiteName
Write-Sub "Site '$SiteName' demarre sur http://localhost:$HttpPort"

exit 0
