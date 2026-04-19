# ============================================================
# 06-postgrest.ps1 - Installe PostgREST + NSSM en service Windows
# ============================================================
# Expose la base oliveapp en REST API compatible Supabase REST
# - Telecharge PostgREST (binaire Windows)
# - Telecharge NSSM (gestionnaire de services)
# - Cree role d'authentification + role anon
# - Genere postgrest.conf avec JWT secret
# - Enregistre le service Windows "PostgREST" demarrage auto
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][SecureString]$SuperPassword,
    [string]$DbName = "oliveapp",
    [string]$DbAuthRole = "authenticator",
    [string]$DbAnonRole = "web_anon",
    [string]$InstallDir = "C:\PostgREST",
    [int]$Port = 3000,
    [string]$JwtSecret = "",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

# --- Versions ---
$pgrstVersion = "v12.2.3"
$pgrstUrl = "https://github.com/PostgREST/postgrest/releases/download/$pgrstVersion/postgrest-$pgrstVersion-windows-x64.zip"
$nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"

# --- Locate psql ---
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    $candidate = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    if (Test-Path $candidate) {
        $psqlPath = $candidate
        $env:Path = "C:\Program Files\PostgreSQL\16\bin;$env:Path"
    } else {
        Write-Host "    [ERR] psql introuvable. Lancez d'abord 02-postgres.ps1" -ForegroundColor Red
        exit 1
    }
} else {
    $psqlPath = $psqlPath.Source
}

# --- Convert SecureString ---
function ConvertFrom-SecureStringPlain {
    param([SecureString]$s)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$superPwd = ConvertFrom-SecureStringPlain $SuperPassword

# --- Generate password for authenticator if needed ---
$authPwd = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})

# --- Generate JWT secret if not provided (min 32 chars) ---
if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
    $JwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
    Write-Sub "JWT secret genere automatiquement (48 chars)"
}

# --- Create install dir ---
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# --- Download PostgREST ---
$pgrstExe = Join-Path $InstallDir "postgrest.exe"
if (-not (Test-Path $pgrstExe)) {
    Write-Sub "Telechargement PostgREST $pgrstVersion..."
    $zipPath = Join-Path $env:TEMP "postgrest.zip"
    Invoke-WebRequest -Uri $pgrstUrl -OutFile $zipPath -UseBasicParsing
    Write-Sub "Extraction..."
    Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
    Remove-Item $zipPath -ErrorAction SilentlyContinue
    if (-not (Test-Path $pgrstExe)) {
        Write-Host "    [ERR] postgrest.exe introuvable apres extraction" -ForegroundColor Red
        exit 1
    }
    Write-Sub "PostgREST installe dans $InstallDir"
} else {
    Write-Sub "PostgREST deja present"
}

# --- Download NSSM ---
$nssmExe = Join-Path $InstallDir "nssm.exe"
if (-not (Test-Path $nssmExe)) {
    Write-Sub "Telechargement NSSM (gestionnaire de services)..."
    $nssmZip = Join-Path $env:TEMP "nssm.zip"
    Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
    $nssmExtract = Join-Path $env:TEMP "nssm-extract"
    if (Test-Path $nssmExtract) { Remove-Item -Recurse -Force $nssmExtract }
    Expand-Archive -Path $nssmZip -DestinationPath $nssmExtract -Force
    $nssmSrc = Get-ChildItem -Path $nssmExtract -Recurse -Filter "nssm.exe" | Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1
    if (-not $nssmSrc) {
        Write-Host "    [ERR] nssm.exe (win64) introuvable" -ForegroundColor Red
        exit 1
    }
    Copy-Item $nssmSrc.FullName $nssmExe -Force
    Remove-Item $nssmZip, $nssmExtract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Sub "NSSM installe"
} else {
    Write-Sub "NSSM deja present"
}

# --- Create roles in PostgreSQL ---
Write-Sub "Creation des roles PostgREST (authenticator, $DbAnonRole)..."
$rolesSql = @"
DO `$`$
BEGIN
  -- Anonymous role (no login, used by PostgREST when no JWT)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DbAnonRole') THEN
    CREATE ROLE $DbAnonRole NOLOGIN;
  END IF;

  -- Authenticator role (login, switches to anon or authenticated via JWT)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DbAuthRole') THEN
    CREATE ROLE $DbAuthRole LOGIN PASSWORD '$($authPwd -replace "'", "''")' NOINHERIT;
  ELSE
    ALTER ROLE $DbAuthRole WITH PASSWORD '$($authPwd -replace "'", "''")';
  END IF;

  -- Allow authenticator to switch to anon
  GRANT $DbAnonRole TO $DbAuthRole;

  -- Stub 'authenticated' role (for users with JWT) if not present
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  GRANT authenticated TO $DbAuthRole;
END
`$`$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO $DbAnonRole, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $DbAnonRole;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $DbAnonRole;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
"@

$tmpSql = New-TemporaryFile
Set-Content -Path $tmpSql -Value $rolesSql -Encoding UTF8
$env:PGPASSWORD = $superPwd
& $psqlPath -h $PgHost -p $PgPort -U postgres -d $DbName -v ON_ERROR_STOP=1 -f $tmpSql.FullName 2>&1 | Out-Null
$rc = $LASTEXITCODE
$env:PGPASSWORD = $null
Remove-Item $tmpSql -ErrorAction SilentlyContinue
if ($rc -ne 0) {
    Write-Host "    [ERR] Echec creation roles PostgREST" -ForegroundColor Red
    exit 1
}
Write-Sub "Roles crees"

# --- Generate postgrest.conf ---
$confPath = Join-Path $InstallDir "postgrest.conf"
$dbUriEscaped = $authPwd -replace '@', '%40' -replace ':', '%3A'
$conf = @"
# postgrest.conf - genere par 06-postgrest.ps1
db-uri = "postgres://$DbAuthRole`:$dbUriEscaped@$PgHost`:$PgPort/$DbName"
db-schemas = "public"
db-anon-role = "$DbAnonRole"

server-host = "0.0.0.0"
server-port = $Port

jwt-secret = "$JwtSecret"
jwt-aud = "authenticated"

# CORS (autorise tout - restreindre en prod)
server-cors-allowed-origins = "*"

# Pool
db-pool = 10
db-pool-acquisition-timeout = 10

# Log
log-level = "info"
"@
Set-Content -Path $confPath -Value $conf -Encoding UTF8
Write-Sub "Configuration ecrite : $confPath"

# --- Save credentials file (admin only) ---
$credsPath = Join-Path $InstallDir "credentials.txt"
$creds = @"
PostgREST credentials - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
============================================================
Endpoint           : http://localhost:$Port
JWT Secret         : $JwtSecret
DB authenticator   : $DbAuthRole
DB authenticator pwd : $authPwd
DB anon role       : $DbAnonRole
Conf file          : $confPath

A utiliser dans .env.production du frontend :
VITE_API_URL="http://localhost:$Port"
VITE_JWT_SECRET (backend uniquement, ne PAS exposer cote frontend)
"@
Set-Content -Path $credsPath -Value $creds -Encoding UTF8
icacls $credsPath /inheritance:r /grant:r "Administrators:(F)" "SYSTEM:(F)" 2>&1 | Out-Null
Write-Sub "Identifiants sauvegardes : $credsPath (admin only)"

# --- Register Windows service via NSSM ---
$serviceName = "PostgREST"
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Sub "Service $serviceName existant - reconfiguration"
    & $nssmExe stop $serviceName 2>&1 | Out-Null
    & $nssmExe remove $serviceName confirm 2>&1 | Out-Null
}

Write-Sub "Enregistrement du service Windows '$serviceName'..."
& $nssmExe install $serviceName $pgrstExe $confPath 2>&1 | Out-Null
& $nssmExe set $serviceName AppDirectory $InstallDir 2>&1 | Out-Null
& $nssmExe set $serviceName DisplayName "PostgREST API ($DbName)" 2>&1 | Out-Null
& $nssmExe set $serviceName Description "API REST sur la base $DbName via PostgREST" 2>&1 | Out-Null
& $nssmExe set $serviceName Start SERVICE_AUTO_START 2>&1 | Out-Null
& $nssmExe set $serviceName AppStdout (Join-Path $InstallDir "postgrest.log") 2>&1 | Out-Null
& $nssmExe set $serviceName AppStderr (Join-Path $InstallDir "postgrest.err.log") 2>&1 | Out-Null
& $nssmExe set $serviceName AppRotateFiles 1 2>&1 | Out-Null
& $nssmExe set $serviceName AppRotateBytes 10485760 2>&1 | Out-Null

Write-Sub "Demarrage du service..."
& $nssmExe start $serviceName 2>&1 | Out-Null
Start-Sleep -Seconds 3

$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Sub "Service $serviceName : Running"
} else {
    Write-Host "    [WARN] Service $serviceName n'est pas en Running. Voir $InstallDir\postgrest.err.log" -ForegroundColor Yellow
}

# --- Firewall rule ---
$ruleName = "PostgREST-$Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Sub "Ouverture port $Port dans le pare-feu..."
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
}

# --- Test endpoint ---
Write-Sub "Test du endpoint http://localhost:$Port ..."
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5
    Write-Sub "PostgREST repond (HTTP $($resp.StatusCode))"
} catch {
    Write-Host "    [WARN] Pas de reponse - verifiez $InstallDir\postgrest.err.log" -ForegroundColor Yellow
}

# Cleanup
$superPwd = $null
$authPwd = $null
[GC]::Collect()

Write-Host ""
Write-Host "  PostgREST pret sur http://localhost:$Port" -ForegroundColor Green
Write-Host "  Identifiants : $credsPath" -ForegroundColor Green
Write-Host "  Logs         : $InstallDir\postgrest.log" -ForegroundColor Green
Write-Host ""
exit 0
