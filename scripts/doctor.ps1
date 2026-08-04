# Environment health check.
# Usage: .\scripts\doctor.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$failures = 0

function Write-Ok([string]$Message) { Write-Host "OK: $Message" -ForegroundColor Green }
function Write-Info([string]$Message) { Write-Host "INFO: $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) {
    Write-Host "FAIL: $Message" -ForegroundColor Red
    $script:failures++
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Cursor — doctor" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

try {
    $nodeVersion = node -v
    $major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
    if ($major -ge 18) { Write-Ok "Node $nodeVersion" } else { Write-Fail "Node $nodeVersion — need v18+" }
} catch { Write-Fail "Node.js not installed" }

try { Write-Ok "npm $(npm -v)" } catch { Write-Fail "npm not installed" }
try { Write-Ok "git $((git --version) -replace 'git version ','')" } catch { Write-Fail "git not installed" }

if (Test-Path "node_modules") { Write-Ok "node_modules present" } else { Write-Fail "node_modules missing — run npm run setup:win" }
if (Test-Path "node_modules\node-pty") { Write-Ok "node-pty installed" } else { Write-Fail "node-pty missing" }
if (Test-Path "node_modules\electron") { Write-Ok "electron installed" } else { Write-Fail "electron missing" }

foreach ($f in @("assets\icon\icon.png", "assets\icon\icon.ico")) {
    if (Test-Path $f) { Write-Ok $f } else { Write-Fail "Missing $f" }
}

if (-not (Test-Path "lsp")) { New-Item -ItemType Directory -Path "lsp" | Out-Null }
Write-Ok "lsp/ directory ready"

Write-Host ""
if ($failures -gt 0) {
    Write-Fail "$failures check(s) failed"
    exit 1
}
Write-Ok "All required checks passed"
Write-Host ""
