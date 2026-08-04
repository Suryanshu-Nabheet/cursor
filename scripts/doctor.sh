#!/usr/bin/env bash
# Environment health check before developing or packaging.
# Usage: ./scripts/doctor.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok() { echo -e "${GREEN}OK:${NC} $1"; }
info() { echo -e "${YELLOW}INFO:${NC} $1"; }
fail() { echo -e "${RED}FAIL:${NC} $1"; FAILURES=$((FAILURES + 1)); }

FAILURES=0

echo "================================================"
echo "  Cursor — doctor"
echo "================================================"
echo ""

# Node
if command -v node >/dev/null 2>&1; then
    NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        ok "Node $(node -v)"
    else
        fail "Node $(node -v) — need v18+"
    fi
else
    fail "Node.js not installed"
fi

# npm
if command -v npm >/dev/null 2>&1; then
    ok "npm $(npm -v)"
else
    fail "npm not installed"
fi

# Git
if command -v git >/dev/null 2>&1; then
    ok "git $(git --version | awk '{print $3}')"
else
    fail "git not installed"
fi

# Dependencies
if [ -d node_modules ]; then
    ok "node_modules present"
else
    fail "node_modules missing — run npm run setup"
fi

# Lockfile
if [ -f package-lock.json ]; then
    ok "package-lock.json present"
else
    info "No package-lock.json (npm ci will fall back to npm install)"
fi

# Native module used by terminal
if [ -d node_modules/node-pty ]; then
    ok "node-pty installed"
else
    fail "node-pty missing — terminal will not work"
fi

# Electron
if [ -d node_modules/electron ]; then
    ok "electron installed"
else
    fail "electron missing"
fi

# Icons for packaging
for f in assets/icon/icon.png assets/icon/icon.icns assets/icon/icon.ico; do
    if [ -f "$f" ]; then
        ok "$f"
    else
        fail "Missing $f (needed for packaging / Dock icon)"
    fi
done

# LSP dir
if [ -d lsp ]; then
    ok "lsp/ directory ready"
else
    info "lsp/ missing — will be created on setup"
    mkdir -p lsp
fi

# Optional: Ollama for local AI
if command -v curl >/dev/null 2>&1; then
    if curl -sf --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        ok "Ollama reachable at localhost:11434"
    else
        info "Ollama not reachable (optional — needed for default local AI completion)"
    fi
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
    fail "$FAILURES check(s) failed"
    exit 1
fi

ok "All required checks passed"
echo ""
