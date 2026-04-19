#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DESCRIPTION="${1:-}"
TYPE_ARG="${2:-}"

# ── Validate input ─────────────────────────────────────────────────────────────

if [ -z "$DESCRIPTION" ]; then
  echo -e "${RED}Error: se requiere un slug o descripción.${NC}"
  echo ""
  echo "Uso: bash scripts/new-worktree.sh <slug> [feature|fix|improv|techDebt]"
  echo "Ej:  bash scripts/new-worktree.sh fix-decimal-parsing fix"
  exit 1
fi

# ── Select branch type ────────────────────────────────────────────────────────

if [ -n "$TYPE_ARG" ]; then
  TYPE="$TYPE_ARG"
else
  echo -e "${BLUE}Tipo de rama:${NC}"
  echo "  1) feature/"
  echo "  2) fix/"
  echo "  3) improv/"
  echo "  4) techDebt/"
  echo ""
  read -rp "Elegí (1-4): " TYPE_CHOICE
  case "$TYPE_CHOICE" in
    1) TYPE="feature" ;;
    2) TYPE="fix" ;;
    3) TYPE="improv" ;;
    4) TYPE="techDebt" ;;
    *) echo -e "${RED}Opción inválida: $TYPE_CHOICE${NC}"; exit 1 ;;
  esac
fi

# ── Normalize slug ─────────────────────────────────────────────────────────────

SLUG=$(echo "$DESCRIPTION" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9]/-/g' \
  | sed 's/-\{2,\}/-/g' \
  | sed 's/^-//' \
  | sed 's/-$//')

if [ -z "$SLUG" ]; then
  echo -e "${RED}Error: la descripción no produce un slug válido.${NC}"
  exit 1
fi

# ── Calculate paths ────────────────────────────────────────────────────────────

MAIN_REPO=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$MAIN_REPO")
WORKTREE_NAME="kakebot-${SLUG}"
WORKTREE_PATH="${PARENT_DIR}/${WORKTREE_NAME}"
BRANCH_NAME="${TYPE}/${SLUG}"

echo ""
echo -e "${BLUE}──────────────────────────────────────────${NC}"
echo -e "  Worktree:  ${YELLOW}${WORKTREE_NAME}${NC}"
echo -e "  Rama:      ${YELLOW}${BRANCH_NAME}${NC}"
echo -e "  Ruta:      ${WORKTREE_PATH}"
echo -e "${BLUE}──────────────────────────────────────────${NC}"
echo ""

# Check worktree path doesn't already exist
if [ -d "$WORKTREE_PATH" ]; then
  echo -e "${RED}Error: ya existe un directorio en ${WORKTREE_PATH}${NC}"
  echo "Elegí un nombre diferente o removelo con: git worktree remove \"$WORKTREE_PATH\""
  exit 1
fi

# ── Step 1: Create worktree ────────────────────────────────────────────────────

echo -e "${YELLOW}[1/4] Creando worktree...${NC}"
git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"
echo -e "${GREEN}✓ Worktree creado${NC}"

# ── Step 2: npm install ────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[2/4] Instalando dependencias (npm install)...${NC}"
(cd "$WORKTREE_PATH/functions" && npm install)
echo -e "${GREEN}✓ Dependencias instaladas${NC}"

# ── Step 3: Copy .env files (gitignored, not present in new worktree) ─────────

echo ""
echo -e "${YELLOW}[3/4] Copiando archivos .env...${NC}"
ENV_COPIED=0
for ENV_FILE in .env .env.test .env.prod; do
  SRC="$MAIN_REPO/functions/$ENV_FILE"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$WORKTREE_PATH/functions/$ENV_FILE"
    echo -e "  ${GREEN}✓${NC} $ENV_FILE"
    ENV_COPIED=$((ENV_COPIED + 1))
  fi
done
if [ "$ENV_COPIED" -eq 0 ]; then
  echo -e "  ${YELLOW}(no se encontraron archivos .env en functions/ — creálos manualmente)${NC}"
fi

# ── Step 4: Copy emulator seed data ───────────────────────────────────────────

echo ""
echo -e "${YELLOW}[4/4] Copiando seed data del emulador...${NC}"
if [ -d "$MAIN_REPO/emulator-data" ]; then
  cp -r "$MAIN_REPO/emulator-data" "$WORKTREE_PATH/emulator-data"
  echo -e "${GREEN}✓ emulator-data copiado${NC}"
else
  echo -e "  (sin emulator-data en el repo raíz — se omite)"
fi

# ── Open VSCode ────────────────────────────────────────────────────────────────

if command -v code &> /dev/null; then
  echo ""
  code "$WORKTREE_PATH"
fi

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Worktree listo${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Ruta:   $WORKTREE_PATH"
echo "  Rama:   $BRANCH_NAME"
echo ""
echo -e "${BLUE}Próximos pasos:${NC}"
echo "  1. Abrí una terminal en la nueva ventana de VSCode"
echo "  2. cd functions"
echo "  3. npm run go → Test → Set polling"
echo ""
