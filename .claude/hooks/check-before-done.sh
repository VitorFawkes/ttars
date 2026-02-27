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
CHANGED_FILES=$(git diff --name-only 2>/dev/null | grep -E '\.(ts|tsx)$')
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

# Typecheck do projeto (necessário checar tudo por causa de dependências de tipos)
TSC_OUTPUT=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  echo "TypeScript tem erros de tipo. Corrija antes de finalizar:" >&2
  echo "$TSC_OUTPUT" | tail -15 >&2
  exit 2
fi

# Verificar se arquivos novos foram criados em diretórios-chave
# NOTA: git diff --name-status "A" só pega staged. Arquivos criados pelo agente são UNTRACKED.
# Por isso usamos git ls-files --others para pegar untracked + git diff para staged.
NEW_UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^src/(hooks|pages|components)/.*\.(ts|tsx)$')
NEW_STAGED=$(git diff --name-status 2>/dev/null | grep "^A" | grep -E 'src/(hooks|pages|components)/' | awk '{print $2}')
NEW_FILES=$(printf "%s\n%s" "$NEW_UNTRACKED" "$NEW_STAGED" | grep -v '^$')
if [ -n "$NEW_FILES" ]; then
  # Verificar se CLAUDE.md foi atualizado na mesma sessão
  CLAUDE_UPDATED=$(git diff --name-only 2>/dev/null | grep "CLAUDE.md")
  if [ -z "$CLAUDE_UPDATED" ]; then
    echo "Arquivos novos criados mas MAPA DO PROJETO no CLAUDE.md não foi atualizado:" >&2
    echo "$NEW_FILES" | sed 's/^/  + /' >&2
    echo "" >&2
    echo "Adicione os novos itens à tabela correspondente no CLAUDE.md (seção MAPA DO PROJETO)." >&2
    exit 2
  fi
fi

# ── Migration guard: bloqueia se .sql novo/modificado sem marker ──
SQL_NEW=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '^supabase/migrations/.*\.sql$')
SQL_MOD=$(git diff --name-only 2>/dev/null | grep -E '^supabase/migrations/.*\.sql$')
ALL_SQL=$(printf "%s\n%s" "$SQL_NEW" "$SQL_MOD" | sort -u | grep -v '^$')

if [ -n "$ALL_SQL" ]; then
  MARKER="$CWD/.claude/.migration_applied"
  if [ ! -f "$MARKER" ] || [ "$(find "$MARKER" -mmin +30 2>/dev/null)" ]; then
    echo "" >&2
    echo "BLOQUEADO: Migrations SQL detectadas mas não promovidas para produção:" >&2
    echo "$ALL_SQL" | sed 's/^/  /' >&2
    echo "" >&2
    echo "Workflow obrigatório:" >&2
    echo "  1. bash .claude/hooks/apply-to-staging.sh <arquivo.sql>" >&2
    echo "  2. Testar com npm run dev (aponta para staging)" >&2
    echo "  3. bash .claude/hooks/promote-to-prod.sh <arquivo.sql>" >&2
    echo "  4. touch .claude/.migration_applied" >&2
    echo "" >&2
    echo "Veja CLAUDE.md seção 'Protocolo de Migrations'." >&2
    exit 2
  fi

  # Smoke test contra produção (se marker existe, verificar que schema está ok)
  SMOKE_SCRIPT="$CWD/.claude/hooks/schema-smoke-test.sh"
  if [ -f "$SMOKE_SCRIPT" ]; then
    SMOKE_OUTPUT=$("$SMOKE_SCRIPT" 2>&1)
    SMOKE_EXIT=$?
    if [ $SMOKE_EXIT -ne 0 ]; then
      echo "" >&2
      echo "BLOQUEADO: Smoke test falhou contra produção:" >&2
      echo "$SMOKE_OUTPUT" >&2
      echo "" >&2
      echo "A migration pode não ter sido promovida corretamente." >&2
      exit 2
    fi
  fi
fi

exit 0
