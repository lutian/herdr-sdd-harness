#!/usr/bin/env bash
# sddharness/init.sh — Verificação do ambiente (stack-agnóstico)
# Rode a partir da raiz OU via ./sddharness/init.sh
# Opera sempre com cwd = raiz do projeto (pai de sddharness/).

set -u
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }

EXIT_CODE=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
H=sddharness

echo "── 1. Verificando arquivos base do arnês ──────────────"

for f in \
  "$H/AGENTS.md" \
  "$H/feature_list.json" \
  "$H/progress/current.md" \
  "$H/docs/architecture.md" \
  "$H/docs/conventions.md" \
  "$H/docs/verification.md" \
  "$H/docs/specs.md" \
  "$H/CHECKPOINTS.md" \
  ".sddharness/config.json"
do
  if [ ! -f "$f" ]; then
    fail "Falta arquivo base: $f"
    EXIT_CODE=1
  else
    ok "Existe $f"
  fi
done

echo ""
echo "── 2. Validando feature_list.json e specs ─────────────"

if command -v node >/dev/null 2>&1; then
  if node "$H/scripts/validate-features.mjs"; then
    :
  else
    EXIT_CODE=1
  fi
else
  fail "node é necessário para validate-features.mjs"
  EXIT_CODE=1
fi

echo ""
echo "── 2b. Docs de stack (architecture/conventions/verification) ──"

if command -v node >/dev/null 2>&1 && [ -f "$H/scripts/docs-ready.mjs" ]; then
  if node "$H/scripts/docs-ready.mjs"; then
    :
  else
    warn "Docs ainda são stub (TODO). Rode /sddharness filldocs ou /sddharness init antes de jira/task/write-spec/approve"
  fi
else
  warn "sddharness/scripts/docs-ready.mjs ausente — não foi possível checar docs"
fi

echo ""
echo "── 3. Detectando stack e rodando verificação ──────────"

resolve_verify_cmd() {
  if [ -n "${HARNESS_VERIFY_CMD:-}" ]; then
    echo "$HARNESS_VERIFY_CMD"
    return
  fi

  if [ -f .sddharness/config.json ] && command -v node >/dev/null 2>&1; then
    local from_cfg
    from_cfg=$(node -e '
      try {
        const c = JSON.parse(require("fs").readFileSync(".sddharness/config.json","utf8"));
        if (c.verifyCmd) process.stdout.write(String(c.verifyCmd));
      } catch {}
    ' 2>/dev/null || true)
    if [ -n "$from_cfg" ]; then
      echo "$from_cfg"
      return
    fi
  fi

  if command -v find >/dev/null 2>&1 && find . -maxdepth 3 -name '*.csproj' -print -quit | grep -q .; then
    if command -v dotnet >/dev/null 2>&1; then
      echo "dotnet test"
      return
    fi
  fi

  if [ -f package.json ]; then
    if command -v jq >/dev/null 2>&1; then
      local has_test
      has_test=$(jq -r '.scripts.test // empty' package.json)
      if [ -n "$has_test" ]; then
        if command -v bun >/dev/null 2>&1 && [ -f bun.lockb ]; then
          echo "bun test"
          return
        fi
        if command -v pnpm >/dev/null 2>&1 && [ -f pnpm-lock.yaml ]; then
          echo "pnpm test"
          return
        fi
        if command -v npm >/dev/null 2>&1; then
          echo "npm test"
          return
        fi
      fi
    elif command -v npm >/dev/null 2>&1; then
      if node -e 'const p=require("./package.json"); process.exit(p.scripts&&p.scripts.test?0:1)'; then
        echo "npm test"
        return
      fi
    fi
  fi

  if [ -f pyproject.toml ] || [ -f pytest.ini ] || [ -d tests ] && ls tests/test_*.py >/dev/null 2>&1; then
    if command -v pytest >/dev/null 2>&1; then
      echo "pytest"
      return
    fi
  fi

  if [ -f n8nac-config.json ] || [ -d workflows ]; then
    if [ -f package.json ] && command -v npm >/dev/null 2>&1; then
      if node -e 'const p=require("./package.json"); process.exit(p.scripts&&p.scripts.validate?0:1)'; then
        echo "npm run validate"
        return
      fi
    fi
  fi

  echo ""
}

VERIFY_CMD="$(resolve_verify_cmd)"

if [ -z "$VERIFY_CMD" ]; then
  warn "Nenhum comando de verificação detectado."
  warn "Defina sddharness/docs/verification.md e HARNESS_VERIFY_CMD ou .sddharness/config.json → verifyCmd"
else
  ok "Comando de verificação: $VERIFY_CMD"
  # shellcheck disable=SC2086
  if eval $VERIFY_CMD; then
    ok "Verificação passou"
  else
    fail "Verificação falhou ($VERIFY_CMD)"
    EXIT_CODE=1
  fi
fi

echo ""
echo "── 4. Resumo ──────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Ambiente pronto. Você pode começar a trabalhar."
else
  fail "Ambiente NÃO está pronto. Resolva os erros antes de avançar."
fi

exit $EXIT_CODE
