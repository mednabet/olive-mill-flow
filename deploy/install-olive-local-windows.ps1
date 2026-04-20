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
    [switch]$SkipIIS,
    [switch]$ForceResetDbUser,
    [switch]$ForceResetDb
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
function Escape-SqlLiteral {
    param([string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value -replace "'", "''"
}
function Assert-SqlIdentifier {
    param([string]$Name, [string]$Label)
    if ($Name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "$Label invalide : $Name. Utilisez seulement lettres, chiffres et underscore."
    }
}
function Get-PsqlPath {
    $cmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidate = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    if (Test-Path $candidate) { return $candidate }
    throw "psql introuvable. PostgreSQL 16 doit etre installe."
}
function Invoke-PsqlText {
    param(
        [Parameter(Mandatory=$true)][string]$PsqlPath,
        [Parameter(Mandatory=$true)][string]$Password,
        [Parameter(Mandatory=$true)][string]$Sql,
        [string]$Database = "postgres",
        [string]$Host = "localhost",
        [int]$Port = 5432,
        [switch]$IgnoreErrors
    )

    $tmp = New-TemporaryFile
    try {
        Set-Content -Path $tmp.FullName -Value $Sql -Encoding UTF8
        $env:PGPASSWORD = $Password
        $output = & $PsqlPath -X -h $Host -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $tmp.FullName 2>&1
        $code = $LASTEXITCODE
        if ((-not $IgnoreErrors) -and $code -ne 0) {
            throw (($output | Out-String).Trim())
        }
        return [pscustomobject]@{ ExitCode = $code; Output = $output }
    }
    finally {
        Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
        $env:PGPASSWORD = $null
    }
}
function Invoke-PsqlQueryValue {
    param(
        [Parameter(Mandatory=$true)][string]$PsqlPath,
        [Parameter(Mandatory=$true)][string]$Password,
        [Parameter(Mandatory=$true)][string]$Sql,
        [string]$Database = "postgres",
        [string]$Host = "localhost",
        [int]$Port = 5432
    )
    $env:PGPASSWORD = $Password
    try {
        $output = & $PsqlPath -X -h $Host -p $Port -U postgres -d $Database -tA -c $Sql 2>&1
        $code = $LASTEXITCODE
        if ($code -ne 0) { throw (($output | Out-String).Trim()) }
        return (($output | Out-String).Trim())
    }
    finally {
        $env:PGPASSWORD = $null
    }
}

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ce script doit etre execute en tant qu'administrateur."
}

Assert-SqlIdentifier -Name $DbName -Label "Nom de base"
Assert-SqlIdentifier -Name $DbUser -Label "Nom utilisateur"

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
$LogFile = Join-Path $LogDir ("install-local-fixed-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Start-Transcript -Path $LogFile -Append | Out-Null

try {
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
    $pgSuperPwdSecure = Read-Host -AsSecureString "Mot de passe pour 'postgres'"
    $appUserPwdSecure = Read-Host -AsSecureString "Mot de passe pour '$DbUser'"
    $pgSuperPwd = ConvertFrom-SecureStringPlain $pgSuperPwdSecure
    $appUserPwd = ConvertFrom-SecureStringPlain $appUserPwdSecure

    # 1. prereqs
    Write-Step "1/7 - Installation des prerequis Windows"
    & (Join-Path $ScriptsDir "01-prereqs.ps1")
    if ($LASTEXITCODE -ne 0) { throw "01-prereqs.ps1 a echoue." }
    Write-Ok "Prerequis installes"

    # 2. postgres
    Write-Step "2/7 - Installation PostgreSQL"
    & (Join-Path $ScriptsDir "02-postgres.ps1") -SuperPassword $pgSuperPwdSecure
    if ($LASTEXITCODE -ne 0) { throw "02-postgres.ps1 a echoue." }
    Write-Ok "PostgreSQL pret"

    # 3. database - robust inline implementation
    Write-Step "3/7 - Creation de la base locale"
    $psqlPath = Get-PsqlPath

    Write-Host "    -> Test de connexion PostgreSQL..." -ForegroundColor Gray
    $testOut = Invoke-PsqlQueryValue -PsqlPath $psqlPath -Password $pgSuperPwd -Sql "SELECT 1;" -Database "postgres"
    if ($testOut -ne "1") {
        throw "Connexion PostgreSQL invalide. Sortie: $testOut"
    }
    Write-Host "    -> Connexion OK" -ForegroundColor Gray

    if ($ForceResetDb) {
        Write-Host "    -> Suppression forcee de la base $DbName..." -ForegroundColor Yellow
        $dropDbSql = @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DbName' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$DbName";
"@
        Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $dropDbSql -Database "postgres" | Out-Null
    }

    if ($ForceResetDbUser) {
        Write-Host "    -> Suppression forcee du role $DbUser..." -ForegroundColor Yellow
        $dropRoleSql = @"
REASSIGN OWNED BY "$DbUser" TO postgres;
DROP OWNED BY "$DbUser";
DROP ROLE IF EXISTS "$DbUser";
"@
        Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $dropRoleSql -Database "postgres" -IgnoreErrors | Out-Null
    }

    $roleExists = Invoke-PsqlQueryValue -PsqlPath $psqlPath -Password $pgSuperPwd -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$(Escape-SqlLiteral $DbUser)';" -Database "postgres"
    $escapedAppPwd = Escape-SqlLiteral $appUserPwd
    if ($roleExists -eq "1") {
        Write-Host "    -> Role $DbUser existe deja, mise a jour du mot de passe..." -ForegroundColor Gray
        $alterRoleSql = "ALTER ROLE `"$DbUser`" WITH LOGIN PASSWORD '$escapedAppPwd';"
        Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $alterRoleSql -Database "postgres" | Out-Null
    } else {
        Write-Host "    -> Creation du role $DbUser..." -ForegroundColor Gray
        $createRoleSql = "CREATE ROLE `"$DbUser`" WITH LOGIN PASSWORD '$escapedAppPwd';"
        Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $createRoleSql -Database "postgres" | Out-Null
    }
    Write-Host "    -> Role $DbUser pret" -ForegroundColor Gray

    $dbExists = Invoke-PsqlQueryValue -PsqlPath $psqlPath -Password $pgSuperPwd -Sql "SELECT 1 FROM pg_database WHERE datname = '$(Escape-SqlLiteral $DbName)';" -Database "postgres"
    if ($dbExists -eq "1") {
        Write-Host "    -> Base $DbName existe deja" -ForegroundColor Gray
        $ownerSql = "ALTER DATABASE `"$DbName`" OWNER TO `"$DbUser`";"
        Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $ownerSql -Database "postgres" | Out-Null
    } else {
        Write-Host "    -> Creation de la base $DbName..." -ForegroundColor Gray
        $createDbSql = "CREATE DATABASE `"$DbName`" OWNER `"$DbUser`" ENCODING 'UTF8' TEMPLATE template0;"
        Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $createDbSql -Database "postgres" | Out-Null
    }

    $schemaPath = Join-Path $DeployRoot "sql\schema.sql"
    if (-not (Test-Path $schemaPath)) {
        throw "Schema introuvable : $schemaPath"
    }
    Write-Host "    -> Application du schema..." -ForegroundColor Gray
    try {
        $env:PGPASSWORD = $pgSuperPwd
        & $psqlPath -X -h localhost -p 5432 -U postgres -d $DbName -v ON_ERROR_STOP=1 -f $schemaPath 2>&1 | ForEach-Object { Write-Host "      $_" }
        if ($LASTEXITCODE -ne 0) { throw "Application du schema en echec" }
    }
    finally {
        $env:PGPASSWORD = $null
    }

    $grantSql = @"
GRANT ALL PRIVILEGES ON DATABASE "$DbName" TO "$DbUser";
GRANT ALL ON SCHEMA public TO "$DbUser";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "$DbUser";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "$DbUser";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "$DbUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "$DbUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "$DbUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO "$DbUser";
"@
    Write-Host "    -> Attribution des privileges..." -ForegroundColor Gray
    Invoke-PsqlText -PsqlPath $psqlPath -Password $pgSuperPwd -Sql $grantSql -Database $DbName | Out-Null
    Write-Ok "Base locale prete"

    # 4. backend api
    Write-Step "4/7 - Installation de l'API locale Node.js"
    & (Join-Path $ScriptsDir "07-api-backend.ps1") -SuperPassword $pgSuperPwdSecure -AppPassword $appUserPwdSecure -DbName $DbName -DbUser $DbUser -Port $ApiPort
    if ($LASTEXITCODE -ne 0) { throw "07-api-backend.ps1 a echoue." }
    Write-Ok "API locale installee"

    # 5. optional postgrest
    if ($InstallPostgrest) {
        Write-Step "5/7 - Installation de PostgREST"
        & (Join-Path $ScriptsDir "06-postgrest.ps1") -SuperPassword $pgSuperPwdSecure -DbName $DbName -Port $PostgrestPort
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

        $diagPath = Join-Path $DeployRoot "LOCAL-MIGRATION-NOTES.txt"
        $srcDir = Join-Path $ProjectRoot "src"
        $count = 0
        if (Test-Path $srcDir) {
            $count = @(Get-ChildItem -Path $srcDir -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx | Select-String -Pattern '@supabase/supabase-js|supabase\.auth|functions\.invoke|\.rpc\(|\.from\(' -AllMatches -ErrorAction SilentlyContinue).Count
        }
        @(
            "Diagnostic du mode 100 % local - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
            "",
            "Le frontend a ete construit avec VITE_API_URL=http://localhost:$ApiPort.",
            "Cependant, le code source contient encore des appels directs a Supabase qui devront etre remplaces pour un mode 100 % local pleinement fonctionnel.",
            "",
            "Nombre approximatif de references detectees : $count",
            "",
            "A migrer en priorite :",
            "- src/lib/auth.tsx",
            "- src/integrations/supabase/client.ts",
            "- les routes et composants qui utilisent supabase.from(...), supabase.rpc(...), supabase.auth.*"
        ) | Set-Content -Path $diagPath -Encoding UTF8
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
    Write-Host "Important : la pile Windows/PostgreSQL est locale, mais le frontend du depot n'est pas encore 100 % migre hors Supabase." -ForegroundColor Yellow
    Write-Host ""
}
finally {
    Stop-Transcript | Out-Null
}
