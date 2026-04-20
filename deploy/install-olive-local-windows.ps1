[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\app-source\olive-mill-flow-main",
    [string]$SiteName = "OliveApp",
    [int]$HttpPort = 8080,
    [string]$InstallRoot = "C:\inetpub\oliveapp",
    [string]$DbName = "oliveapp",
    [string]$DbUser = "oliveapp_user",
    [int]$ApiPort = 4000,
    [int]$PostgrestPort = 3000,
    [switch]$InstallPostgrest,
    [switch]$SkipBuild,
    [switch]$SkipIIS
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step { param([string]$m) Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Warn2 { param([string]$m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Err { param([string]$m) Write-Host "  [ERR]  $m" -ForegroundColor Red }
function ConvertFrom-SecureStringPlain {
    param([SecureString]$s)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ce script doit etre execute en tant qu'administrateur."
}

if (-not (Test-Path $ProjectRoot)) {
    throw "ProjectRoot introuvable : $ProjectRoot"
}

$DeployRoot = Join-Path $ProjectRoot "deploy"
$ScriptsDir = Join-Path $DeployRoot "scripts"
if (-not (Test-Path $ScriptsDir)) {
    throw "Dossier deploy/scripts introuvable : $ScriptsDir"
}

$LogDir = Join-Path $DeployRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("install-local-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Start-Transcript -Path $LogFile -Append | Out-Null

Write-Step "Configuration"
Write-Host "  Projet           : $ProjectRoot"
Write-Host "  Site IIS         : $SiteName"
Write-Host "  Port HTTP        : $HttpPort"
Write-Host "  Repertoire IIS   : $InstallRoot"
Write-Host "  Base PostgreSQL  : $DbName"
Write-Host "  Utilisateur DB   : $DbUser"
Write-Host "  API locale       : http://localhost:$ApiPort"
if ($InstallPostgrest) { Write-Host "  PostgREST local  : http://localhost:$PostgrestPort" }
Write-Host "  Log              : $LogFile"

Write-Step "Secrets"
$pgSuperPwd = Read-Host -AsSecureString "Mot de passe pour 'postgres'"
$appUserPwd = Read-Host -AsSecureString "Mot de passe pour '$DbUser'"

# 1. prereqs
Write-Step "1/7 - Installation des prerequis Windows"
& (Join-Path $ScriptsDir "01-prereqs.ps1")
if ($LASTEXITCODE -ne 0) { throw "01-prereqs.ps1 a echoue." }
Write-Ok "Prerequis installes"

# 2. postgres
Write-Step "2/7 - Installation PostgreSQL"
& (Join-Path $ScriptsDir "02-postgres.ps1") -SuperPassword $pgSuperPwd
if ($LASTEXITCODE -ne 0) { throw "02-postgres.ps1 a echoue." }
Write-Ok "PostgreSQL pret"

# 3. database
Write-Step "3/7 - Creation de la base locale"
& (Join-Path $ScriptsDir "03-database.ps1") -SuperPassword $pgSuperPwd -AppPassword $appUserPwd -DbName $DbName -DbUser $DbUser
if ($LASTEXITCODE -ne 0) { throw "03-database.ps1 a echoue." }
Write-Ok "Base locale prete"

# 4. backend api
Write-Step "4/7 - Installation de l'API locale Node.js"
& (Join-Path $ScriptsDir "07-api-backend.ps1") -SuperPassword $pgSuperPwd -AppPassword $appUserPwd -DbName $DbName -DbUser $DbUser -Port $ApiPort
if ($LASTEXITCODE -ne 0) { throw "07-api-backend.ps1 a echoue." }
Write-Ok "API locale installee"

# 5. optional postgrest
if ($InstallPostgrest) {
    Write-Step "5/7 - Installation de PostgREST"
    & (Join-Path $ScriptsDir "06-postgrest.ps1") -SuperPassword $pgSuperPwd -DbName $DbName -Port $PostgrestPort
    if ($LASTEXITCODE -ne 0) { throw "06-postgrest.ps1 a echoue." }
    Write-Ok "PostgREST installe"
} else {
    Write-Step "5/7 - PostgREST"
    Write-Warn2 "Ignore. Ajoutez -InstallPostgrest si vous voulez aussi l'API REST SQL directe."
}

# 6. local build env
if (-not $SkipBuild) {
    Write-Step "6/7 - Build frontend en mode local"
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        throw "node/npm introuvables apres installation des prerequis."
    }

    $envProduction = Join-Path $ProjectRoot ".env.production"
    @"
VITE_API_URL="http://localhost:$ApiPort"
VITE_SUPABASE_URL=""
VITE_SUPABASE_PUBLISHABLE_KEY=""
VITE_SUPABASE_PROJECT_ID=""
"@ | Set-Content -Path $envProduction -Encoding UTF8
    Write-Ok ".env.production genere pour l'API locale"

    Push-Location $ProjectRoot
    try {
        Write-Host "    -> npm ci" -ForegroundColor Gray
        & npm ci --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "      $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "npm ci a echoue, tentative npm install"
            & npm install --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "      $_" }
            if ($LASTEXITCODE -ne 0) { throw "npm install a echoue." }
        }

        Write-Host "    -> npm run build" -ForegroundColor Gray
        & npm run build 2>&1 | ForEach-Object { Write-Host "      $_" }
        if ($LASTEXITCODE -ne 0) {
            throw "Le build frontend a echoue."
        }
    }
    finally {
        Pop-Location
    }

    $buildDir = @(
        (Join-Path $ProjectRoot ".output\public"),
        (Join-Path $ProjectRoot "dist"),
        (Join-Path $ProjectRoot "build\client")
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $buildDir) {
        throw "Repertoire de build introuvable apres npm run build."
    }
    [Environment]::SetEnvironmentVariable("OLIVEAPP_BUILD_DIR", $buildDir, "Process")
    Write-Ok "Frontend compile : $buildDir"

    # Diagnostic structurel sur les references Supabase
    $matches = @(Select-String -Path (Join-Path $ProjectRoot "src\**\*.ts*"), (Join-Path $ProjectRoot "src\**\*.tsx") -Pattern "supabase\.auth|from\(|rpc\(|functions\.invoke|@supabase/supabase-js" -SimpleMatch -ErrorAction SilentlyContinue)
    $diagPath = Join-Path $DeployRoot "LOCAL-MIGRATION-NOTES.txt"
    $msg = @()
    $msg += "Diagnostic du mode 100 % local - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $msg += ""
    $msg += "Le frontend a ete construit avec VITE_API_URL=http://localhost:$ApiPort."
    $msg += "Cependant, le code source contient encore des appels directs a Supabase qui devront etre remplaces pour un mode 100 % local pleinement fonctionnel."
    $msg += ""
    $msg += "Nombre approximatif de references detectees : $($matches.Count)"
    $msg += ""
    $msg += "Exemples :"
    $msg += ($matches | Select-Object -First 25 | ForEach-Object { "- {0}:{1}" -f $_.Path, $_.LineNumber })
    $msg += ""
    $msg += "A migrer en priorite :"
    $msg += "- src/lib/auth.tsx"
    $msg += "- src/integrations/supabase/client.ts"
    $msg += "- les routes et composants qui utilisent supabase.from(...), supabase.rpc(...), supabase.auth.*"
    Set-Content -Path $diagPath -Value ($msg -join [Environment]::NewLine) -Encoding UTF8
    Write-Warn2 "Le frontend est build avec l'API locale, mais une migration de code reste necessaire. Voir : $diagPath"
} else {
    Write-Step "6/7 - Build frontend"
    Write-Warn2 "Ignore avec -SkipBuild"
}

# 7. IIS
if (-not $SkipIIS) {
    Write-Step "7/7 - Publication IIS"
    & (Join-Path $ScriptsDir "05-iis-site.ps1") -SiteName $SiteName -HttpPort $HttpPort -InstallRoot $InstallRoot -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw "05-iis-site.ps1 a echoue." }
    Write-Ok "Site IIS publie"
} else {
    Write-Step "7/7 - Publication IIS"
    Write-Warn2 "Ignore avec -SkipIIS"
}

# Health checks
Write-Step "Verification rapide"
try {
    $apiHealth = Invoke-WebRequest -Uri "http://localhost:$ApiPort/health" -UseBasicParsing -TimeoutSec 5
    Write-Ok "API locale repond : HTTP $($apiHealth.StatusCode)"
} catch {
    Write-Warn2 "API locale non joignable sur http://localhost:$ApiPort/health"
}

if ($InstallPostgrest) {
    try {
        $pgr = Invoke-WebRequest -Uri "http://localhost:$PostgrestPort" -UseBasicParsing -TimeoutSec 5
        Write-Ok "PostgREST repond : HTTP $($pgr.StatusCode)"
    } catch {
        Write-Warn2 "PostgREST non joignable sur http://localhost:$PostgrestPort"
    }
}

Write-Step "Termine"
Write-Host "  Application IIS : http://localhost:$HttpPort" -ForegroundColor Green
Write-Host "  API locale      : http://localhost:$ApiPort" -ForegroundColor Green
if ($InstallPostgrest) { Write-Host "  PostgREST       : http://localhost:$PostgrestPort" -ForegroundColor Green }
Write-Host "  Log install     : $LogFile" -ForegroundColor Green
Write-Host "  Notes migration : $(Join-Path $DeployRoot 'LOCAL-MIGRATION-NOTES.txt')" -ForegroundColor Yellow
Write-Host ""
Write-Host "Important : ce script installe une pile 100 % locale Windows/PostgreSQL, mais le frontend du depot n'est pas encore 100 % migre hors Supabase." -ForegroundColor Yellow
Write-Host ""

Stop-Transcript | Out-Null
