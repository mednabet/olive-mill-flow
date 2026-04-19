# ============================================================
# install.ps1 - Orchestrateur de deploiement Windows
# ============================================================
[CmdletBinding()]
param(
    [string]$SiteName = "OliveApp",
    [int]$HttpPort = 8080,
    [string]$InstallRoot = "C:\inetpub\oliveapp",
    [string]$DbName = "oliveapp",
    [string]$DbUser = "oliveapp_user",
    [switch]$SkipPrereqs,
    [switch]$SkipPostgres,
    [switch]$SkipBuild,
    [switch]$SkipPostgrest,
    [int]$PostgrestPort = 3000
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- Setup logging ---
$DeployRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $DeployRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("install-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Start-Transcript -Path $LogFile -Append | Out-Null

function Write-Step { param($Msg) Write-Host "`n=== $Msg ===" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "  [OK]  $Msg" -ForegroundColor Green }
function Write-Warn2 { param($Msg) Write-Host "  [WARN] $Msg" -ForegroundColor Yellow }
function Write-Err  { param($Msg) Write-Host "  [ERR]  $Msg" -ForegroundColor Red }

# --- Verify admin ---
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "Ce script doit etre execute en tant qu'administrateur."
    exit 1
}

Write-Step "Configuration"
Write-Host "  Site IIS         : $SiteName"
Write-Host "  Port HTTP        : $HttpPort"
Write-Host "  Repertoire       : $InstallRoot"
Write-Host "  Base PostgreSQL  : $DbName"
Write-Host "  Utilisateur DB   : $DbUser"
Write-Host "  Logs             : $LogFile"

# --- Prompt for secrets ---
Write-Step "Mots de passe"
$pgSuperPwd = Read-Host -AsSecureString "Mot de passe pour 'postgres' (superuser PostgreSQL, nouveau si install)"
$appUserPwd = Read-Host -AsSecureString "Mot de passe pour '$DbUser' (utilisateur applicatif)"

# --- Prompt for API URL ---
Write-Step "Configuration API"
Write-Host "  Si vous gardez Supabase, laissez vide (les valeurs du .env actuel seront utilisees)."
Write-Host "  Pour une API locale (PostgREST, backend Node), entrez son URL (ex: http://localhost:3000)."
$apiUrl = Read-Host "URL de l'API backend (vide = Supabase)"

$ScriptsDir = Join-Path $DeployRoot "scripts"

try {
    if (-not $SkipPrereqs) {
        Write-Step "1/6 - Installation des prerequis (IIS, URL Rewrite, Node)"
        & (Join-Path $ScriptsDir "01-prereqs.ps1")
        if ($LASTEXITCODE -ne 0) { throw "Echec installation prerequis" }
        Write-Ok "Prerequis installes"
    } else {
        Write-Warn2 "Etape prerequis ignoree (-SkipPrereqs)"
    }

    if (-not $SkipPostgres) {
        Write-Step "2/6 - Installation PostgreSQL 16"
        & (Join-Path $ScriptsDir "02-postgres.ps1") -SuperPassword $pgSuperPwd
        if ($LASTEXITCODE -ne 0) { throw "Echec installation PostgreSQL" }
        Write-Ok "PostgreSQL installe"
    } else {
        Write-Warn2 "Etape PostgreSQL ignoree (-SkipPostgres)"
    }

    Write-Step "3/6 - Creation de la base de donnees et application du schema"
    & (Join-Path $ScriptsDir "03-database.ps1") `
        -SuperPassword $pgSuperPwd `
        -AppPassword $appUserPwd `
        -DbName $DbName `
        -DbUser $DbUser
    if ($LASTEXITCODE -ne 0) { throw "Echec creation base" }
    Write-Ok "Base $DbName prete"

    if (-not $SkipBuild) {
        Write-Step "4/6 - Build du frontend"
        & (Join-Path $ScriptsDir "04-build.ps1") `
            -ProjectRoot (Split-Path -Parent $DeployRoot) `
            -ApiUrl $apiUrl
        if ($LASTEXITCODE -ne 0) { throw "Echec build frontend" }
        Write-Ok "Frontend build"
    } else {
        Write-Warn2 "Etape build ignoree (-SkipBuild)"
    }

    Write-Step "5/6 - Configuration IIS"
    & (Join-Path $ScriptsDir "05-iis-site.ps1") `
        -SiteName $SiteName `
        -HttpPort $HttpPort `
        -InstallRoot $InstallRoot `
        -ProjectRoot (Split-Path -Parent $DeployRoot)
    if ($LASTEXITCODE -ne 0) { throw "Echec configuration IIS" }
    Write-Ok "Site IIS '$SiteName' deploye"

    if (-not $SkipPostgrest) {
        Write-Step "6/6 - Installation PostgREST (API REST locale)"
        & (Join-Path $ScriptsDir "06-postgrest.ps1") `
            -SuperPassword $pgSuperPwd `
            -DbName $DbName `
            -Port $PostgrestPort
        if ($LASTEXITCODE -ne 0) { throw "Echec installation PostgREST" }
        Write-Ok "PostgREST deploye sur le port $PostgrestPort"
    } else {
        Write-Warn2 "Etape PostgREST ignoree (-SkipPostgrest)"
    }

    Write-Step "Termine"
    Write-Host ""
    Write-Host "  Application accessible sur : " -NoNewline
    Write-Host "http://localhost:$HttpPort" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Base de donnees : " -NoNewline
    Write-Host "postgresql://${DbUser}:***@localhost:5432/$DbName" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Prochaine etape : configurer une API backend (PostgREST ou Node)" -ForegroundColor Yellow
    Write-Host "  Voir deploy\README.md section 'Important'" -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Err $_.Exception.Message
    Write-Err $_.ScriptStackTrace
    Stop-Transcript | Out-Null
    exit 1
}

Stop-Transcript | Out-Null
exit 0
