# ============================================================
# 04-build.ps1 - Installe les deps et build le frontend Vite
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ProjectRoot,
    [string]$ApiUrl = ""
)

$ErrorActionPreference = "Stop"

function Write-Sub { param($m) Write-Host "    -> $m" -ForegroundColor Gray }

# --- Refresh PATH (Node may have just been installed) ---
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "    [ERR] node introuvable. Relancer 01-prereqs.ps1 ou redemarrer la session." -ForegroundColor Red
    exit 1
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Host "    [ERR] npm introuvable." -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot
Write-Sub "Repertoire projet : $ProjectRoot"

# --- Generate .env.production ---
$envFile = Join-Path $ProjectRoot ".env.production"
$tplFile = Join-Path $PSScriptRoot "..\config\env.production.tpl"

if (Test-Path $tplFile) {
    Write-Sub "Generation .env.production depuis le template..."
    $content = Get-Content $tplFile -Raw

    if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
        # Garde Supabase : reprend les valeurs du .env existant
        $existingEnv = Join-Path $ProjectRoot ".env"
        if (Test-Path $existingEnv) {
            Write-Sub "  -> Reprise des variables Supabase depuis .env"
            Copy-Item $existingEnv $envFile -Force
        } else {
            Write-Host "    [WARN] .env introuvable et pas d'API URL fournie" -ForegroundColor Yellow
            Set-Content -Path $envFile -Value $content -Encoding UTF8
        }
    } else {
        $content = $content -replace "__API_URL__", $ApiUrl
        Set-Content -Path $envFile -Value $content -Encoding UTF8
        Write-Sub "  -> API_URL = $ApiUrl"
    }
}

# --- Install deps ---
Write-Sub "npm ci (peut prendre quelques minutes)..."
& npm ci --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "      $_" }
if ($LASTEXITCODE -ne 0) {
    Write-Sub "npm ci a echoue, tentative npm install..."
    & npm install --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "      $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [ERR] npm install a echoue" -ForegroundColor Red
        exit 1
    }
}

# --- Build ---
Write-Sub "npm run build..."
& npm run build 2>&1 | ForEach-Object { Write-Host "      $_" }
if ($LASTEXITCODE -ne 0) {
    Write-Host "    [ERR] Build echoue" -ForegroundColor Red
    exit 1
}

# --- Locate build output ---
$candidates = @(
    (Join-Path $ProjectRoot ".output\public"),
    (Join-Path $ProjectRoot "dist"),
    (Join-Path $ProjectRoot "build\client")
)
$buildDir = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $buildDir) {
    Write-Host "    [ERR] Repertoire de build introuvable. Cherche dans : $($candidates -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Sub "Build genere dans : $buildDir"

# Stash path for next script via env var (process-wide)
[Environment]::SetEnvironmentVariable("OLIVEAPP_BUILD_DIR", $buildDir, "Process")

exit 0
