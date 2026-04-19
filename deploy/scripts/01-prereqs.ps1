# ============================================================
# 01-prereqs.ps1 - IIS, URL Rewrite, Node.js 20
# ============================================================
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

# --- IIS features ---
Write-Sub "Activation des roles IIS..."
$features = @(
    "IIS-WebServerRole",
    "IIS-WebServer",
    "IIS-CommonHttpFeatures",
    "IIS-StaticContent",
    "IIS-DefaultDocument",
    "IIS-HttpErrors",
    "IIS-HttpRedirect",
    "IIS-ApplicationDevelopment",
    "IIS-HealthAndDiagnostics",
    "IIS-HttpLogging",
    "IIS-Security",
    "IIS-RequestFiltering",
    "IIS-Performance",
    "IIS-HttpCompressionStatic",
    "IIS-HttpCompressionDynamic",
    "IIS-WebServerManagementTools",
    "IIS-ManagementConsole",
    "IIS-ManagementService"
)

foreach ($f in $features) {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction SilentlyContinue).State
    if ($state -ne "Enabled") {
        Write-Sub "  Activation : $f"
        Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart -ErrorAction SilentlyContinue | Out-Null
    }
}
Write-Sub "Roles IIS OK"

# --- IIS module: WebAdministration ---
Import-Module WebAdministration -ErrorAction SilentlyContinue

# --- URL Rewrite Module ---
$rewriteInstalled = Test-Path "C:\Windows\System32\inetsrv\rewrite.dll"
if (-not $rewriteInstalled) {
    Write-Sub "Telechargement URL Rewrite Module 2.1..."
    $rewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
    $rewriteMsi = Join-Path $env:TEMP "rewrite_amd64.msi"
    Invoke-WebRequest -Uri $rewriteUrl -OutFile $rewriteMsi -UseBasicParsing
    Write-Sub "Installation URL Rewrite..."
    Start-Process msiexec.exe -ArgumentList "/i `"$rewriteMsi`" /quiet /norestart" -Wait -NoNewWindow
    Remove-Item $rewriteMsi -ErrorAction SilentlyContinue
    Write-Sub "URL Rewrite installe"
} else {
    Write-Sub "URL Rewrite deja installe"
}

# --- Node.js 20 ---
$needNode = $true
try {
    $nodeVer = (& node --version 2>$null).TrimStart('v')
    if ($nodeVer -and ([version]$nodeVer.Split('-')[0] -ge [version]"20.0.0")) {
        Write-Sub "Node.js $nodeVer deja installe"
        $needNode = $false
    }
} catch {}

if ($needNode) {
    Write-Sub "Telechargement Node.js 20 LTS..."
    $nodeUrl = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi"
    $nodeMsi = Join-Path $env:TEMP "node-v20-x64.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
    Write-Sub "Installation Node.js..."
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
    Remove-Item $nodeMsi -ErrorAction SilentlyContinue

    # Refresh PATH for current session
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    Write-Sub "Node.js installe"
}

exit 0
