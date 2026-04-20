# ============================================================
# 03-database.ps1 - Cree la base, l'utilisateur, applique le schema
# Version corrigee : idempotente et robuste sous Windows / PostgreSQL
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][SecureString]$SuperPassword,
    [Parameter(Mandatory = $true)][SecureString]$AppPassword,
    [string]$DbName = "oliveapp",
    [string]$DbUser = "oliveapp_user",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432
)

$ErrorActionPreference = "Stop"

function Write-Sub { param([string]$m) Write-Host "    -> $m" -ForegroundColor Gray }
function Write-Err2 { param([string]$m) Write-Host "    [ERR] $m" -ForegroundColor Red }
function Write-Warn2 { param([string]$m) Write-Host "    [WARN] $m" -ForegroundColor Yellow }

function ConvertFrom-SecureStringPlain {
    param([SecureString]$s)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Resolve-PsqlPath {
    $cmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $env:Path = (Split-Path $candidate -Parent) + ";" + $env:Path
            return $candidate
        }
    }
    return $null
}

$psqlPath = Resolve-PsqlPath
if (-not $psqlPath) {
    Write-Err2 "psql introuvable. PostgreSQL est-il installe ?"
    exit 1
}

$superPwd = ConvertFrom-SecureStringPlain $SuperPassword
$appPwd = ConvertFrom-SecureStringPlain $AppPassword

function Invoke-PsqlText {
    param(
        [Parameter(Mandatory = $true)][string]$Sql,
        [string]$Database = "postgres",
        [switch]$Quiet
    )

    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($tmp, $Sql, $utf8NoBom)
        $env:PGPASSWORD = $superPwd
        $output = & $psqlPath -X -h $PgHost -p $PgPort -U postgres -d $Database -v ON_ERROR_STOP=1 -f $tmp 2>&1
        $code = $LASTEXITCODE
        if (-not $Quiet -and $output) { $output | ForEach-Object { Write-Host "       $_" } }
        return @{ Code = $code; Output = $output }
    }
    finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue -Force
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

function Invoke-PsqlCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string]$Database = "postgres"
    )

    try {
        $env:PGPASSWORD = $superPwd
        $output = & $psqlPath -X -A -t -h $PgHost -p $PgPort -U postgres -d $Database -v ON_ERROR_STOP=1 -c $Command 2>&1
        $code = $LASTEXITCODE
        return @{ Code = $code; Output = ($output | Out-String).Trim() }
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

function Invoke-PsqlFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Database = "postgres"
    )
    try {
        $env:PGPASSWORD = $superPwd
        $output = & $psqlPath -X -h $PgHost -p $PgPort -U postgres -d $Database -v ON_ERROR_STOP=1 -f $Path 2>&1
        $code = $LASTEXITCODE
        return @{ Code = $code; Output = $output }
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

Write-Sub "Test de connexion PostgreSQL..."
$test = Invoke-PsqlCommand -Command "SELECT version();" -Database "postgres"
if ($test.Code -ne 0) {
    Write-Err2 "Impossible de se connecter a PostgreSQL."
    Write-Err2 "Verifiez le mot de passe 'postgres' et que le service tourne."
    if ($test.Output) { Write-Err2 "Sortie : $($test.Output)" }
    exit 1
}
Write-Sub "Connexion OK"

$escapedDbUser = $DbUser.Replace('"', '""')
$escapedDbName = $DbName.Replace('"', '""')
$escapedAppPwd = $appPwd.Replace("'", "''")

Write-Sub "Creation / mise a jour du role $DbUser..."
$roleSql = @"
DO \$db_role\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$($DbUser.Replace("'", "''"))') THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '$escapedDbUser', '$escapedAppPwd');
    ELSE
        EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', '$escapedDbUser', '$escapedAppPwd');
    END IF;
END
\$db_role\$;
"@
$roleResult = Invoke-PsqlText -Sql $roleSql -Database "postgres" -Quiet
if ($roleResult.Code -ne 0) {
    Write-Err2 "Echec creation / mise a jour role $DbUser"
    if ($roleResult.Output) { $roleResult.Output | ForEach-Object { Write-Host "       $_" -ForegroundColor Red } }
    exit 1
}

Write-Sub "Verification de l'existence de la base $DbName..."
$dbExists = Invoke-PsqlCommand -Command "SELECT 1 FROM pg_database WHERE datname = '$($DbName.Replace("'", "''"))';" -Database "postgres"
if ($dbExists.Code -ne 0) {
    Write-Err2 "Impossible de verifier l'existence de la base $DbName"
    if ($dbExists.Output) { Write-Err2 $dbExists.Output }
    exit 1
}

if ($dbExists.Output -ne "1") {
    Write-Sub "Creation de la base $DbName..."
    $createDbSql = @"
SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0', '$escapedDbName', '$escapedDbUser') AS sql_to_run;
"@
    $sqlLine = Invoke-PsqlCommand -Command $createDbSql -Database "postgres"
    if ($sqlLine.Code -ne 0 -or [string]::IsNullOrWhiteSpace($sqlLine.Output)) {
        Write-Err2 "Impossible de preparer la commande de creation de la base."
        if ($sqlLine.Output) { Write-Err2 $sqlLine.Output }
        exit 1
    }
    $createDbResult = Invoke-PsqlCommand -Command $sqlLine.Output -Database "postgres"
    if ($createDbResult.Code -ne 0) {
        Write-Err2 "Echec creation base $DbName"
        if ($createDbResult.Output) { Write-Err2 $createDbResult.Output }
        exit 1
    }
    Write-Sub "Base $DbName creee"
} else {
    Write-Sub "Base $DbName existe deja"
}

$schemaPath = Join-Path (Split-Path -Parent $PSScriptRoot) "sql\schema.sql"
if (-not (Test-Path $schemaPath)) {
    Write-Err2 "Schema introuvable : $schemaPath"
    exit 1
}

Write-Sub "Application du schema..."
$schemaResult = Invoke-PsqlFile -Path $schemaPath -Database $DbName
if ($schemaResult.Code -ne 0) {
    Write-Warn2 "Le schema a retourne des erreurs. Cela peut venir d'objets deja existants ou d'un schema Supabase incomplet en local."
    if ($schemaResult.Output) {
        $schemaResult.Output | Select-Object -First 25 | ForEach-Object { Write-Host "       $_" -ForegroundColor Yellow }
    }
}

Write-Sub "Attribution des privileges a $DbUser..."
$grantSql = @"
GRANT ALL PRIVILEGES ON DATABASE "$escapedDbName" TO "$escapedDbUser";
GRANT USAGE, CREATE ON SCHEMA public TO "$escapedDbUser";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "$escapedDbUser";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "$escapedDbUser";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "$escapedDbUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "$escapedDbUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "$escapedDbUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO "$escapedDbUser";
"@
$grantResult = Invoke-PsqlText -Sql $grantSql -Database $DbName -Quiet
if ($grantResult.Code -ne 0) {
    Write-Err2 "Echec attribution privileges"
    if ($grantResult.Output) { $grantResult.Output | ForEach-Object { Write-Host "       $_" -ForegroundColor Red } }
    exit 1
}

$superPwd = $null
$appPwd = $null
[GC]::Collect()

Write-Sub "Base de donnees prete"
exit 0
