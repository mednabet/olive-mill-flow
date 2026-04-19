# ============================================================
# 03-database.ps1 - Cree la base, l'utilisateur, applique le schema
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][SecureString]$SuperPassword,
    [Parameter(Mandatory=$true)][SecureString]$AppPassword,
    [string]$DbName = "oliveapp",
    [string]$DbUser = "oliveapp_user",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432
)

$ErrorActionPreference = "Stop"

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

# --- Locate psql ---
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    $candidate = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    if (Test-Path $candidate) {
        $psqlPath = $candidate
        $env:Path = "C:\Program Files\PostgreSQL\16\bin;$env:Path"
    } else {
        Write-Host "    [ERR] psql introuvable. PostgreSQL est-il installe ?" -ForegroundColor Red
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
$appPwd   = ConvertFrom-SecureStringPlain $AppPassword

# --- Run psql helper ---
function Invoke-Psql {
    param([string]$Sql, [string]$Database = "postgres")
    $env:PGPASSWORD = $superPwd
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $Sql -Encoding UTF8
    try {
        & $psqlPath -h $PgHost -p $PgPort -U postgres -d $Database -v ON_ERROR_STOP=1 -f $tmp.FullName 2>&1
        $code = $LASTEXITCODE
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
        $env:PGPASSWORD = $null
    }
    return $code
}

function Invoke-PsqlFile {
    param([string]$Path, [string]$Database = "postgres")
    $env:PGPASSWORD = $superPwd
    try {
        & $psqlPath -h $PgHost -p $PgPort -U postgres -d $Database -v ON_ERROR_STOP=1 -f $Path 2>&1
        $code = $LASTEXITCODE
    } finally {
        $env:PGPASSWORD = $null
    }
    return $code
}

# --- Test connection ---
Write-Sub "Test de connexion PostgreSQL..."
$env:PGPASSWORD = $superPwd
$test = & $psqlPath -h $PgHost -p $PgPort -U postgres -d postgres -c "SELECT version();" 2>&1
$env:PGPASSWORD = $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    [ERR] Impossible de se connecter a PostgreSQL." -ForegroundColor Red
    Write-Host "    Verifiez le mot de passe 'postgres' et que le service tourne." -ForegroundColor Red
    Write-Host "    Sortie : $test" -ForegroundColor Red
    exit 1
}
Write-Sub "Connexion OK"

# --- Create role ---
Write-Sub "Creation du role $DbUser..."
$createRole = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DbUser') THEN
    CREATE ROLE $DbUser LOGIN PASSWORD '$($appPwd -replace "'", "''")';
  ELSE
    ALTER ROLE $DbUser WITH PASSWORD '$($appPwd -replace "'", "''")';
  END IF;
END
`$`$;
"@
$code = Invoke-Psql -Sql $createRole
if ($code -ne 0) { Write-Host "    [ERR] Echec creation role" -ForegroundColor Red; exit 1 }

# --- Create database ---
Write-Sub "Creation de la base $DbName..."
$env:PGPASSWORD = $superPwd
$dbExists = & $psqlPath -h $PgHost -p $PgPort -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
$env:PGPASSWORD = $null

if ($dbExists -ne "1") {
    $code = Invoke-Psql -Sql "CREATE DATABASE `"$DbName`" OWNER $DbUser ENCODING 'UTF8' TEMPLATE template0;"
    if ($code -ne 0) { Write-Host "    [ERR] Echec creation base" -ForegroundColor Red; exit 1 }
    Write-Sub "Base $DbName creee"
} else {
    Write-Sub "Base $DbName existe deja"
}

# --- Apply schema ---
$schemaPath = Join-Path (Split-Path -Parent $PSScriptRoot) "sql\schema.sql"
if (-not (Test-Path $schemaPath)) {
    Write-Host "    [ERR] Schema introuvable : $schemaPath" -ForegroundColor Red
    exit 1
}

Write-Sub "Application du schema (tables, enums, fonctions, triggers)..."
$code = Invoke-PsqlFile -Path $schemaPath -Database $DbName
if ($code -ne 0) {
    Write-Host "    [WARN] Schema applique avec des avertissements (peut etre normal si re-run)" -ForegroundColor Yellow
}

# --- Grant privileges ---
Write-Sub "Attribution des privileges a $DbUser..."
$grants = @"
GRANT ALL PRIVILEGES ON DATABASE "$DbName" TO $DbUser;
GRANT ALL ON SCHEMA public TO $DbUser;
GRANT ALL ON ALL TABLES IN SCHEMA public TO $DbUser;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO $DbUser;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO $DbUser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DbUser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DbUser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DbUser;
"@
$code = Invoke-Psql -Sql $grants -Database $DbName
if ($code -ne 0) { Write-Host "    [ERR] Echec attribution privileges" -ForegroundColor Red; exit 1 }

# Cleanup
$superPwd = $null
$appPwd = $null
[GC]::Collect()

Write-Sub "Base de donnees prete"
exit 0
