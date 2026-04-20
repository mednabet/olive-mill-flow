# ============================================================
# 07-api-backend.ps1 - Installe l'API backend Node.js (Fastify)
#                      en service Windows via NSSM
# ============================================================
# Etapes :
#  1. Copie deploy\api-backend vers $InstallDir
#  2. npm install --omit=dev
#  3. Cree les tables auth (auth_users) dans la base
#  4. Genere .env avec DATABASE_URL + JWT_SECRET aleatoire
#  5. Telecharge NSSM si absent
#  6. Enregistre le service Windows "OliveAppAPI" demarrage auto
#  7. Ouvre le port dans le pare-feu
#  8. Test du endpoint /health
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][SecureString]$SuperPassword,
    [Parameter(Mandatory=$true)][SecureString]$AppPassword,
    [string]$DbName = "oliveapp",
    [string]$DbUser = "oliveapp_user",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432,
    [string]$InstallDir = "C:\OliveAppAPI",
    [int]$Port = 4000,
    [string]$CorsOrigin = "*",
    [string]$ServiceName = "OliveAppAPI"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

# --- Locate node/npm ---
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
    Write-Host "    [ERR] node/npm introuvables. Relancer 01-prereqs.ps1." -ForegroundColor Red
    exit 1
}

# --- Locate psql ---
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    $candidate = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    if (Test-Path $candidate) {
        $psqlPath = $candidate
        $env:Path = "C:\Program Files\PostgreSQL\16\bin;$env:Path"
    } else {
        Write-Host "    [ERR] psql introuvable. PostgreSQL doit etre installe." -ForegroundColor Red
        exit 1
    }
} else {
    $psqlPath = $psqlPath.Source
}

# --- Convert passwords ---
function ConvertFrom-SecureStringPlain {
    param([SecureString]$s)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
$superPwd = ConvertFrom-SecureStringPlain $SuperPassword
$appPwd = ConvertFrom-SecureStringPlain $AppPassword

# --- Source directory ---
$srcDir = Join-Path (Split-Path -Parent $PSScriptRoot) "api-backend"
if (-not (Test-Path (Join-Path $srcDir "package.json"))) {
    Write-Host "    [ERR] Source backend introuvable : $srcDir" -ForegroundColor Red
    exit 1
}

# --- Stop existing service before copying ---
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing -and $existing.Status -eq "Running") {
    Write-Sub "Arret du service $ServiceName en cours..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# --- Copy source to install dir ---
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Sub "Copie des sources vers $InstallDir..."
Copy-Item -Path (Join-Path $srcDir "package.json") -Destination $InstallDir -Force
Copy-Item -Path (Join-Path $srcDir "src") -Destination $InstallDir -Recurse -Force
if (Test-Path (Join-Path $srcDir "sql")) {
    Copy-Item -Path (Join-Path $srcDir "sql") -Destination $InstallDir -Recurse -Force
}

# --- npm install ---
Push-Location $InstallDir
try {
    Write-Sub "npm install --omit=dev (1-3 min)..."
    & npm install --omit=dev --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "      $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [ERR] npm install a echoue" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# --- Apply auth tables ---
$authSql = Join-Path $InstallDir "sql\auth_tables.sql"
if (Test-Path $authSql) {
    Write-Sub "Application des tables d'authentification..."
    $env:PGPASSWORD = $superPwd
    & $psqlPath -h $PgHost -p $PgPort -U postgres -d $DbName -v ON_ERROR_STOP=1 -f $authSql 2>&1 | Out-Null
    $rc = $LASTEXITCODE
    $env:PGPASSWORD = $null
    if ($rc -ne 0) {
        Write-Host "    [WARN] Application des tables auth avec avertissements" -ForegroundColor Yellow
    } else {
        Write-Sub "Tables auth_users creees"
    }

    # Grant on auth_users to app user
    $env:PGPASSWORD = $superPwd
    $grantSql = "GRANT ALL ON TABLE public.auth_users TO $DbUser;"
    & $psqlPath -h $PgHost -p $PgPort -U postgres -d $DbName -c $grantSql 2>&1 | Out-Null
    $env:PGPASSWORD = $null
}

# --- Generate JWT secret (48 chars) ---
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })

# --- URL-encode app password for DATABASE_URL ---
function ConvertTo-UrlEncoded {
    param([string]$s)
    Add-Type -AssemblyName System.Web
    return [System.Web.HttpUtility]::UrlEncode($s)
}
$appPwdEnc = ConvertTo-UrlEncoded $appPwd
$dbUrl = "postgresql://${DbUser}:${appPwdEnc}@${PgHost}:${PgPort}/${DbName}"

# --- Write .env ---
$envPath = Join-Path $InstallDir ".env"
$envContent = @"
# Genere par 07-api-backend.ps1 - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
PORT=$Port
HOST=0.0.0.0
LOG_LEVEL=info
DATABASE_URL=$dbUrl
JWT_SECRET=$jwtSecret
CORS_ORIGIN=$CorsOrigin
BCRYPT_ROUNDS=10
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
icacls $envPath /inheritance:r /grant:r "Administrators:(F)" "SYSTEM:(F)" 2>&1 | Out-Null
Write-Sub "Configuration ecrite : $envPath (admin only)"

# --- Save credentials summary ---
$credsPath = Join-Path $InstallDir "credentials.txt"
$creds = @"
OliveApp API backend - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
============================================================
Endpoint    : http://localhost:$Port
Health      : http://localhost:$Port/health
Service     : $ServiceName (gerable via services.msc)
Install dir : $InstallDir
JWT Secret  : $jwtSecret
DB user     : $DbUser
DB name     : $DbName
Logs        : $InstallDir\api.log
              $InstallDir\api.err.log

A utiliser dans .env.production du frontend :
VITE_API_URL=http://localhost:$Port
"@
Set-Content -Path $credsPath -Value $creds -Encoding UTF8
icacls $credsPath /inheritance:r /grant:r "Administrators:(F)" "SYSTEM:(F)" 2>&1 | Out-Null

# --- Download NSSM if needed ---
$nssmExe = Join-Path $InstallDir "nssm.exe"
# Reuse PostgREST's NSSM if already there
$pgrstNssm = "C:\PostgREST\nssm.exe"
if (-not (Test-Path $nssmExe)) {
    if (Test-Path $pgrstNssm) {
        Write-Sub "Reutilisation de NSSM existant ($pgrstNssm)"
        Copy-Item $pgrstNssm $nssmExe -Force
    } else {
        Write-Sub "Telechargement NSSM..."
        $nssmZip = Join-Path $env:TEMP "nssm.zip"
        Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
        $nssmExtract = Join-Path $env:TEMP "nssm-api-extract"
        if (Test-Path $nssmExtract) { Remove-Item -Recurse -Force $nssmExtract }
        Expand-Archive -Path $nssmZip -DestinationPath $nssmExtract -Force
        $nssmSrc = Get-ChildItem -Path $nssmExtract -Recurse -Filter "nssm.exe" | Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1
        Copy-Item $nssmSrc.FullName $nssmExe -Force
        Remove-Item $nssmZip, $nssmExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- Register Windows service ---
if ($existing) {
    Write-Sub "Service $ServiceName existe deja - reconfiguration"
    & $nssmExe stop $ServiceName 2>&1 | Out-Null
    & $nssmExe remove $ServiceName confirm 2>&1 | Out-Null
}

$nodeExe = (Get-Command node).Source
Write-Sub "Enregistrement du service '$ServiceName'..."
& $nssmExe install $ServiceName $nodeExe "src/server.js" 2>&1 | Out-Null
& $nssmExe set $ServiceName AppDirectory $InstallDir 2>&1 | Out-Null
& $nssmExe set $ServiceName DisplayName "OliveApp API ($DbName)" 2>&1 | Out-Null
& $nssmExe set $ServiceName Description "API backend Node.js (Fastify) pour OliveApp" 2>&1 | Out-Null
& $nssmExe set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
& $nssmExe set $ServiceName AppStdout (Join-Path $InstallDir "api.log") 2>&1 | Out-Null
& $nssmExe set $ServiceName AppStderr (Join-Path $InstallDir "api.err.log") 2>&1 | Out-Null
& $nssmExe set $ServiceName AppRotateFiles 1 2>&1 | Out-Null
& $nssmExe set $ServiceName AppRotateBytes 10485760 2>&1 | Out-Null
# NODE_ENV
& $nssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production" 2>&1 | Out-Null

Write-Sub "Demarrage du service..."
& $nssmExe start $ServiceName 2>&1 | Out-Null
Start-Sleep -Seconds 4

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Sub "Service $ServiceName : Running"
} else {
    Write-Host "    [WARN] Service $ServiceName n'est pas en Running. Voir $InstallDir\api.err.log" -ForegroundColor Yellow
}

# --- Firewall rule ---
$ruleName = "OliveAppAPI-$Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Sub "Ouverture port $Port dans le pare-feu..."
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
}

# --- Test /health ---
Write-Sub "Test http://localhost:$Port/health ..."
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -eq 200) {
        Write-Sub "API repond (HTTP 200) - $($resp.Content)"
    } else {
        Write-Host "    [WARN] HTTP $($resp.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [WARN] Pas de reponse - voir $InstallDir\api.err.log" -ForegroundColor Yellow
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Yellow
}

# Cleanup
$superPwd = $null
$appPwd = $null
$jwtSecret = $null
[GC]::Collect()

Write-Host ""
Write-Host "  API backend prete sur http://localhost:$Port" -ForegroundColor Green
Write-Host "  Identifiants : $credsPath" -ForegroundColor Green
Write-Host "  Logs         : $InstallDir\api.log" -ForegroundColor Green
Write-Host ""
exit 0
