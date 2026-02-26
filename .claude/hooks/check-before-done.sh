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
    echo "BLOQUEADO: Migrations SQL detectadas mas não verificadas:" >&2
    echo "$ALL_SQL" | sed 's/^/  /' >&2
    echo "" >&2
    echo "Aplique cada migration ao banco remoto e depois rode:" >&2
    echo "  touch .claude/.migration_applied" >&2
    echo "" >&2
    echo "Veja CLAUDE.md seção 'Protocolo de Migrations' para o workflow completo." >&2
    exit 2
  fi
fi

exit 0
