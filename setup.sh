#!/usr/bin/env bash
# =============================================================================
#  E-Commerce Backend — One-shot setup script
#  Usage: bash setup.sh [--reset]
#
#  --reset   Drops and recreates the database schema, then reseeds.
#            WARNING: all existing data will be lost. Dev only!
# =============================================================================

set -euo pipefail

RESET=false
if [[ "${1:-}" == "--reset" ]]; then
  RESET=true
fi

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}${BOLD}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}${BOLD}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}${BOLD}[ERROR]${NC} $*" >&2; }

# ── banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      E-Commerce Backend — Setup          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Prerequisites check ───────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Please install Node.js 22+ and re-run."
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
if (( NODE_VERSION < 22 )); then
  warn "Node.js $NODE_VERSION detected. Version 22+ is recommended."
fi

if ! command -v npm &>/dev/null; then
  error "npm is not found. Install Node.js with npm and re-run."
  exit 1
fi

success "Node.js $(node -v) / npm $(npm -v)"

# ── 2. .env check ────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  error ".env file not found."
  echo ""
  echo "  Create a .env file in this directory with at minimum:"
  echo ""
  echo '    DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"'
  echo '    JWT_SECRET="replace-with-a-secure-secret"'
  echo '    PORT=4000'
  echo '    NODE_ENV=development'
  echo ""
  exit 1
fi

# Verify DATABASE_URL is set and non-empty
set +u
source <(grep -E '^DATABASE_URL=' .env | head -1)
set -u

if [[ -z "${DATABASE_URL:-}" ]]; then
  error "DATABASE_URL is not set in your .env file. Please add it and re-run."
  exit 1
fi

success ".env file found and DATABASE_URL is set."

# ── 3. Install dependencies ───────────────────────────────────────────────────
info "Installing npm dependencies..."
npm install
success "Dependencies installed."

# ── 4. Generate Prisma client ─────────────────────────────────────────────────
info "Generating Prisma client..."
npx prisma generate
success "Prisma client generated."

# ── 5. Migrate ────────────────────────────────────────────────────────────────
if [[ "$RESET" == true ]]; then
  warn "RESET mode: dropping all data and re-applying migrations..."
  npx prisma migrate reset --force --skip-seed
  success "Database reset and migrations applied."
else
  info "Applying database migrations..."
  npx prisma migrate deploy
  success "Migrations applied."
fi

# ── 6. Seed ───────────────────────────────────────────────────────────────────
info "Seeding the database..."
npm run migrate:seed
success "Database seeded."

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║         Setup completed successfully!    ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Start the dev server with:  ${BOLD}npm run start:dev${NC}"
echo -e "  API available at:           ${BOLD}http://localhost:\${PORT:-4000}${NC}"
echo ""
echo -e "  ${BOLD}Admin credentials:${NC}"
echo "    Super Admin    → superadmin@example.com  / SuperAdmin123!"
echo "    KYC Officer    → officer@example.com     / Officer123!"
echo "    Compliance HOD → compliance@example.com  / Compliance123!"
echo "    Support Admin  → support@example.com     / Support123!"
echo ""
echo -e "  ${BOLD}Regular users:${NC}"
echo "    Shop Owner     → admin@example.com       / admin123456"
echo "    Test User      → test@example.com        / test123456"
echo ""
