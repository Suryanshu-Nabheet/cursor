# Cursor IDE Setup Script for Windows
# Run from anywhere: .\scripts\setup.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Cursor IDE Setup - Windows" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

function Print-Success {
    param([string]$Message)
    Write-Host "OK: $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
}

function Print-Info {
    param([string]$Message)
    Write-Host "INFO: $Message" -ForegroundColor Yellow
}

try {
    $nodeVersion = node -v
    $nodeMajorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')

    if ($nodeMajorVersion -lt 16) {
        Print-Error "Node.js version must be 16 or higher. Current version: $nodeVersion"
        exit 1
    }
    Print-Success "Node.js $nodeVersion detected"
} catch {
    Print-Error "Node.js is not installed!"
    Write-Host "Please install Node.js 16 or higher from https://nodejs.org/"
    exit 1
}

try {
    $npmVersion = npm -v
    Print-Success "npm $npmVersion detected"
} catch {
    Print-Error "npm is not installed!"
    exit 1
}

try {
    $gitVersion = git --version
    Print-Success "$gitVersion detected"
} catch {
    Print-Error "git is not installed!"
    exit 1
}

Print-Info "Cleaning old build artifacts..."
& "$Root\scripts\clean.ps1"

Print-Info "Installing npm dependencies..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm ci failed, falling back to npm install..." -ForegroundColor Yellow
    npm install
}
$ErrorActionPreference = $prevEAP

if ($LASTEXITCODE -eq 0) {
    Print-Success "Dependencies installed successfully"
} else {
    Print-Error "Failed to install dependencies"
    Write-Host "Try removing node_modules and package-lock.json, then run npm install"
    exit 1
}

Print-Info "Setting up Language Server Protocol (LSP) directory..."
if (-not (Test-Path "lsp")) {
    New-Item -ItemType Directory -Path "lsp" -Force | Out-Null
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Print-Success "Cursor IDE setup completed successfully!"
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run 'npm start' to launch Cursor IDE"
Write-Host "  2. Add your AI keys in Settings (BYOK), or use Ollama locally"
Write-Host ""
Write-Host "For more information, see README.md"
Write-Host ""
