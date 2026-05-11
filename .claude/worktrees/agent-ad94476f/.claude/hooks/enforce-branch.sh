#!/bin/bash
# Hook: Bloqueia commits e pushes direto na branch main
# Força o uso de feature branches para isolamento

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('input',{}).get('command',''))" 2>/dev/null)

# Só verificar comandos git commit e git push
if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
  exit 0
fi

# Verificar se está na branch main
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  # Permitir push de branches com -u (upstream tracking)
  if echo "$COMMAND" | grep -q "push.*-u"; then
    exit 0
  fi

  echo "BLOQUEADO: Não faça commit/push direto na branch main." >&2
  echo "" >&2
  echo "Crie uma feature branch primeiro:" >&2
  echo "  git checkout -b feat/nome-da-feature" >&2
  echo "" >&2
  echo "Depois use /subir para commit + push + PR." >&2
  exit 2
fi

exit 0