#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active')

# Evitar loop infinito
if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')
cd "$CWD" 2>/dev/null || exit 0

# Pegar APENAS arquivos TS/TSX modificados (não o projeto inteiro)
# Filtrar arquivos deletados (que não existem mais no disco)
CHANGED_FILES=$(git diff --name-only 2>/dev/null | grep -E '\.(ts|tsx)$' | while read -r f; do [ -f "$f" ] && echo "$f"; done)
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Lint apenas nos arquivos alterados
LINT_OUTPUT=$(echo "$CHANGED_FILES" | xargs npx eslint --no-warn-ignored 2>&1)
if [ $? -ne 0 ]; then
  echo "ESLint tem erros nos arquivos modificados. Corrija antes de finalizar:" >&2
  echo "$LINT_OUTPUT" | grep -E "error|warning" | tail -15 >&2
  exit 2
fi

# Build completo (tsc + vite build — pega erros de tipo, imports quebrados, case sensitivity, bundling)
BUILD_OUTPUT=$(npm run build 2>&1)
if [ $? -ne 0 ]; then
  echo "Build falhou. Corrija antes de finalizar:" >&2
  echo "$BUILD_OUTPUT" | tail -20 >&2
  exit 2
fi

# Verificar se arquivos novos foram criados em diretórios-chave
# Se sim, CODEBASE.md deve ter sido atualizado (via npm run sync:fix)
NEW_UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^src/(hooks|pages|components)/.*\.(ts|tsx)$')
NEW_STAGED=$(git diff --name-status 2>/dev/null | grep "^A" | grep -E 'src/(hooks|pages|components)/' | awk '{print $2}')
NEW_FILES=$(printf "%s\n%s" "$NEW_UNTRACKED" "$NEW_STAGED" | grep -v '^$')
if [ -n "$NEW_FILES" ]; then
  # Verificar se CODEBASE.md foi atualizado (via npm run sync:fix)
  CODEBASE_UPDATED=$(git diff --name-only 2>/dev/null | grep "CODEBASE.md")
  if [ -z "$CODEBASE_UPDATED" ]; then
    echo "Arquivos novos criados mas CODEBASE.md não foi atualizado:" >&2
    echo "$NEW_FILES" | sed 's/^/  + /' >&2
    echo "" >&2
    echo "Execute: npm run sync:fix" >&2
    exit 2
  fi
fi

# ── Migration guard: bloqueia se .sql novo/modificado sem registro no log ──
# Ignora _archived/ e _baseline/ (migrations consolidadas) e arquivos deletados
SQL_NEW=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^supabase/migrations/.*\.sql$' | grep -vE '_(archived|baseline)/')
SQL_MOD=$(git diff --name-only 2>/dev/null | grep -E '^supabase/migrations/.*\.sql$' | grep -vE '_(archived|baseline)/')
# Filtrar arquivos deletados (só verificar os que existem no disco)
ALL_SQL=$(printf "%s\n%s" "$SQL_NEW" "$SQL_MOD" | sort -u | grep -v '^$' | while read -r f; do [ -f "$f" ] && echo "$f"; done)

if [ -n "$ALL_SQL" ]; then
  LOG_FILE="$CWD/.claude/.migration_log"
  MARKER="$CWD/.claude/.migration_applied"
  PENDING_SQL=""

  # Checar cada arquivo contra o log por arquivo
  while IFS= read -r sql_file; do
    if [ -f "$LOG_FILE" ] && grep -qF "$sql_file" "$LOG_FILE"; then
      : # Já registrado no log — ok
    else
      PENDING_SQL=$(printf "%s\n%s" "$PENDING_SQL" "$sql_file")
    fi
  done <<< "$ALL_SQL"

  PENDING_SQL=$(echo "$PENDING_SQL" | grep -v '^$')

  if [ -n "$PENDING_SQL" ]; then
    # Fallback: aceitar marker booleano < 30 min (backward compat)
    if [ -f "$MARKER" ] && [ -z "$(find "$MARKER" -mmin +30 2>/dev/null)" ]; then
      : # Marker recente — permitir (backward compat)
    else
      echo "" >&2
      echo "BLOQUEADO: Migrations SQL não registradas em .claude/.migration_log:" >&2
      echo "$PENDING_SQL" | sed 's/^/  /' >&2
      echo "" >&2
      echo "Workflow obrigatório:" >&2
      echo "  1. bash .claude/hooks/apply-to-staging.sh <arquivo.sql>" >&2
      echo "  2. Testar com npm run dev (aponta para staging)" >&2
      echo "  3. bash .claude/hooks/promote-to-prod.sh <arquivo.sql>" >&2
      echo "     (promote-to-prod.sh registra automaticamente no log)" >&2
      echo "" >&2
      echo "Veja CLAUDE.md seção 'Protocolo de Migrations'." >&2
      exit 2
    fi
  fi

  # Smoke test — rodar contra staging se migrations pendentes, produção se promovidas
  SMOKE_SCRIPT="$CWD/.claude/hooks/schema-smoke-test.sh"
  if [ -f "$SMOKE_SCRIPT" ]; then
    if [ -n "$PENDING_SQL" ]; then
      # Migrations pendentes → testar contra STAGING
      export SMOKE_URL="https://ivmebyvjarcvrkrbemam.supabase.co"
      export SMOKE_ANON="${STAGING_SUPABASE_ANON_KEY:-}"
      export SMOKE_KEY="${STAGING_SERVICE_ROLE_KEY:-}"
      SMOKE_TARGET="staging"
    else
      SMOKE_TARGET="produção"
    fi

    if [ -z "${SMOKE_ANON:-}" ] && [ "$SMOKE_TARGET" = "staging" ]; then
      echo "SKIP: credenciais de staging não disponíveis para smoke test" >&2
    else
      SMOKE_OUTPUT=$("$SMOKE_SCRIPT" 2>&1)
      SMOKE_EXIT=$?
      if [ $SMOKE_EXIT -ne 0 ]; then
        echo "" >&2
        echo "BLOQUEADO: Smoke test falhou contra $SMOKE_TARGET:" >&2
        echo "$SMOKE_OUTPUT" >&2
        echo "" >&2
        if [ "$SMOKE_TARGET" = "staging" ]; then
          echo "A migration precisa funcionar no staging antes de promover." >&2
        else
          echo "A migration pode não ter sido promovida corretamente." >&2
        fi
        exit 2
      fi
    fi
  fi
fi

# Guardião de isolamento por workspace — sempre roda (independente de .sql)
AUDIT_RLS="$CWD/.claude/hooks/audit-rls-leaks.sh"
if [ -x "$AUDIT_RLS" ]; then
  AUDIT_OUTPUT=$("$AUDIT_RLS" 2>&1)
  AUDIT_EXIT=$?
  if [ $AUDIT_EXIT -ne 0 ]; then
    echo "$AUDIT_OUTPUT" >&2
    exit 2
  fi
fi

exit 0
