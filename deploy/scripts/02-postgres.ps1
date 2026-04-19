# ============================================================
# 02-postgres.ps1 - Installation silencieuse PostgreSQL 16
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][SecureString]$SuperPassword
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

$pgVersion = "16"
$pgRoot = "C:\Program Files\PostgreSQL\$pgVersion"
$pgBin = Join-Path $pgRoot "bin"
$pgData = "C:\PostgreSQL\$pgVersion\data"
$pgService = "postgresql-x64-$pgVersion"

# --- Already installed? ---
$svc = Get-Service -Name $pgService -ErrorAction SilentlyContinue
if ($svc) {
    Write-Sub "PostgreSQL $pgVersion deja installe (service $pgService)"
    if ($svc.Status -ne "Running") {
        Write-Sub "Demarrage du service..."
        Start-Service $pgService
    }
    # Add to PATH for this session
    if ($env:Path -notlike "*$pgBin*") {
        $env:Path = "$pgBin;$env:Path"
    }
    exit 0
}

# --- Download installer ---
$installerUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64.exe"
$installerExe = Join-Path $env:TEMP "postgresql-16-installer.exe"

if (-not (Test-Path $installerExe)) {
    Write-Sub "Telechargement PostgreSQL 16 (~300 Mo)..."
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerExe -UseBasicParsing
}

# --- Convert SecureString to plain (for installer arg) ---
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SuperPassword)
$plainPwd = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

Write-Sub "Installation silencieuse PostgreSQL (peut prendre 5-10 min)..."
$args = @(
    "--mode", "unattended",
    "--unattendedmodeui", "none",
    "--prefix", "`"$pgRoot`"",
    "--datadir", "`"$pgData`"",
    "--superpassword", "`"$plainPwd`"",
    "--servicename", $pgService,
    "--serviceaccount", "NetworkService",
    "--serverport", "5432",
    "--locale", "French, France",
    "--install_runtimes", "0"
)

$proc = Start-Process -FilePath $installerExe -ArgumentList $args -Wait -PassThru -NoNewWindow
$plainPwd = $null
[GC]::Collect()

if ($proc.ExitCode -ne 0) {
    Write-Host "    [ERR] Installer PostgreSQL exit code $($proc.ExitCode)" -ForegroundColor Red
    exit $proc.ExitCode
}

# --- Add bin to system PATH ---
$sysPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($sysPath -notlike "*$pgBin*") {
    Write-Sub "Ajout de $pgBin au PATH systeme"
    [Environment]::SetEnvironmentVariable("Path", "$sysPath;$pgBin", "Machine")
}
$env:Path = "$pgBin;$env:Path"

# --- Start service ---
Start-Service $pgService -ErrorAction SilentlyContinue
Set-Service $pgService -StartupType Automatic

Write-Sub "PostgreSQL $pgVersion installe et demarre"
Remove-Item $installerExe -ErrorAction SilentlyContinue
exit 0
